#!/usr/bin/env bash
# YonderGate gateway provisioning for Raspberry Pi OS Lite (Bookworm).
# Flash Pi OS Lite, boot, copy this repo to /opt/yondergate, then run:
#   sudo bash /opt/yondergate/provisioning/install.sh
set -euo pipefail

REPO=/opt/yondergate
echo "== YonderGate provisioning =="

echo "-- packages"
apt-get update
# wireguard-tools = wg / wg-quick for the WireGuard remote-access option (e.g. FritzBox).
# usb-modeswitch = flips "Zero-CD" LTE dongles from storage mode into modem mode so
# ModemManager can see them (many Huawei/ZTE sticks need this).
# i2c-tools = i2cdetect for the setup page's "Detect hardware" probe.
# gpiod = gpioset, for a relay on the GPIO header (Setup > power switches).
apt-get install -y curl git ffmpeg network-manager modemmanager wireguard-tools usb-modeswitch i2c-tools gpiod

echo "-- swap in RAM (zram) on small boards"
# A 512 MB Pi (Zero 2 W, 3A+) runs the service fine — it measures ~54 MB — but `npm
# install` during an update is another matter, and a box that runs out of memory
# mid-update is a box someone has to drive to. zram gives it compressed swap in RAM:
# no SD-card writes, which matters on a solar site where the power can vanish
# mid-write. Pi OS's own dphys-swapfile stays as it is; zram registers at a higher
# priority, so the kernel reaches for RAM before it reaches for the card.
MEM_KB=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
# An empty or odd value must not abort provisioning under `set -e`: unknown means skip.
case "$MEM_KB" in ''|*[!0-9]*) MEM_KB=0 ;; esac
if [ "$MEM_KB" -gt 0 ] && [ "$MEM_KB" -lt 1572864 ]; then   # < 1.5 GB
  if [ -e /sys/block/zram0 ] || grep -q '^/dev/zram' /proc/swaps 2>/dev/null; then
    echo "   (zram is already set up — left alone)"
  elif apt-get install -y zram-tools; then
    # Debian's zram-tools sources /etc/default/zramswap, so our block wins over the
    # commented defaults above it. Written between markers so re-running the installer
    # replaces it instead of stacking another copy.
    sed -i '/# >>> yondergate/,/# <<< yondergate/d' /etc/default/zramswap 2>/dev/null || true
    cat >> /etc/default/zramswap <<'ZRAM'
# >>> yondergate
ALGO=zstd
PERCENT=60
PRIORITY=100
# <<< yondergate
ZRAM
    systemctl restart zramswap.service 2>/dev/null ||
      systemctl restart zramswap 2>/dev/null ||
      echo "   (zramswap did not restart — it will come up at the next boot)"
    echo "   ($((MEM_KB / 1024)) MB of RAM: zstd zram at 60 % enabled)"
  else
    # Naming the cause and the fix, as everywhere else: this is not fatal, but the
    # operator should know why their next update might die.
    echo "   (could not install zram-tools — not fatal, but on a $((MEM_KB / 1024)) MB board"
    echo "    'npm install' during an update may run out of memory. Fix: apt install zram-tools,"
    echo "    or add a swapfile. See docs/HARDWARE.md.)"
  fi
elif [ "$MEM_KB" -eq 0 ]; then
  echo "   (skipped: could not read /proc/meminfo)"
else
  echo "   (skipped: $((MEM_KB / 1024)) MB of RAM is enough without it)"
fi

echo "-- Node.js 22"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "-- Tailscale"
if ! command -v tailscale >/dev/null; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi

echo "-- ZeroTier (optional remote-access method)"
if ! command -v zerotier-cli >/dev/null; then
  curl -fsSL https://install.zerotier.com | bash || echo "   (ZeroTier install skipped/failed — only needed if you pick ZeroTier)"
fi

echo "-- go2rtc"
if [ ! -x /usr/local/bin/go2rtc ]; then
  ARCH=$(dpkg --print-architecture) # arm64 / armhf
  case "$ARCH" in
    arm64) GOARCH=arm64 ;;
    armhf) GOARCH=armv7 ;;
    *) GOARCH=amd64 ;;
  esac
  curl -fsSL -o /usr/local/bin/go2rtc \
    "https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_${GOARCH}"
  chmod +x /usr/local/bin/go2rtc
fi

echo "-- npm install (sensor module stays optional)"
cd "$REPO"
# --omit=optional keeps the native sensor module (i2c-bus) out of a plain install, so a
# gateway without sensors provisions cleanly. There is nothing to build: the service runs
# TypeScript directly, so an update is a pull plus a restart.
npm install --omit=optional
# Native driver modules the operator installed from the setup UI (Setup > Gateway
# configuration > Native driver modules) are optionalDependencies too, so pass 1
# just pruned them. Put back exactly the ones this gateway recorded — an update
# must not silently turn a configured gateway back into a simulator.
CONFIG="${YGW_CONFIG:-$REPO/yondergate-config.json}"
if [ -f "$CONFIG" ] && command -v python3 >/dev/null 2>&1; then
  DEPS=$(python3 - "$CONFIG" <<'PY'
import json, sys
ALLOWED = {'i2c-bus'}   # mirrors hwDeps.ts
try:
    with open(sys.argv[1]) as f:
        deps = (json.load(f) or {}).get('hardwareDeps') or []
except Exception:
    deps = []
print(' '.join(sorted(d for d in deps if d in ALLOWED)))
PY
) || DEPS=""
  for dep in $DEPS; do
    echo "-- restoring native sensor module: $dep"
    npm install "$dep" -w @yondergate/gateway ||
      echo "   ($dep failed to build — reinstall it in Setup > Gateway configuration, it shows why)"
  done
fi


echo "-- hardware access groups (I2C / GPIO / serial)"
usermod -aG i2c,gpio,dialout "${SUDO_USER:-pi}" || true
# Enable I2C + UART on the Pi if raspi-config is present:
if command -v raspi-config >/dev/null; then
  raspi-config nonint do_i2c 0 || true
  raspi-config nonint do_serial_hw 0 || true
fi

echo "-- runtime state directory (generated video config lives outside the checkout)"
# go2rtc's config is generated by the gateway from the camera settings. It used to be
# written into docker/go2rtc.yaml inside the git checkout, which left every running
# gateway with local modifications and blocked `git pull --ff-only` — including the
# update button in the setup page. Move it once, seed it from whatever is there now so
# go2rtc keeps its streams, and restore the checkout.
install -d -m 0755 /var/lib/yondergate
if [ ! -f /var/lib/yondergate/go2rtc.yaml ] && [ -f "$REPO/docker/go2rtc.yaml" ]; then
  cp "$REPO/docker/go2rtc.yaml" /var/lib/yondergate/go2rtc.yaml
  echo "   (migrated the existing go2rtc config to /var/lib/yondergate/)"
fi
if [ -d "$REPO/.git" ]; then
  git -c safe.directory="$REPO" -C "$REPO" checkout -- docker/go2rtc.yaml 2>/dev/null || true
fi

# Camera tuning files. Raspberry Pi's stock imx519.json has no rpi.af algorithm, so an
# Arducam 16MP stays permanently out of focus; ours adds it. Copied out of the checkout
# so a camera can point at a stable path that survives an update.
install -d -m 0755 /var/lib/yondergate/tuning
cp "$REPO/provisioning/tuning/"*.json /var/lib/yondergate/tuning/ 2>/dev/null || true

echo "-- systemd services"
cp "$REPO/provisioning/systemd/"*.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now go2rtc.service yondergate.service
# The onboarding hotspot is a oneshot fallback (it exits right away when the Pi already
# has a network). Never let it abort provisioning — the gateway service is what matters.
systemctl enable --now yondergate-onboard.service ||
  echo "   (onboard hotspot service did not start — check: journalctl -u yondergate-onboard)"
# `enable --now` starts what is stopped but leaves running services on their OLD unit,
# so a changed ExecStart or Environment= would only take effect at the next reboot.
systemctl try-restart go2rtc.service yondergate.service || true

echo
echo "== Done =="
echo "Setup UI:   http://<pi-ip>:8080/setup"
echo "If the Pi has no network, it starts an OPEN WiFi hotspot 'YonderGate-setup'"
echo "— join it; the captive portal opens http://192.168.4.1:8080/setup"
echo "There, Setup > WiFi scans and joins your network (and sets a hotspot password)."
