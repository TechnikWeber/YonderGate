# YonderGate — hardware guide

*What to buy, how to wire it, and what it costs in watts. Written for the case the
project is built for: a solar plot with no wired power and no wired internet, where
every watt is a panel and a battery you had to carry there.*

> **Read this first:** none of the figures below were measured on a YonderGate box.
> The software numbers (memory, what transcodes) come from this repository; the power
> figures are the published/commonly measured values for the parts. Treat them as a
> budget to design against, then measure your own build — the gateway can show you its
> own consumption once an INA sensor is fitted, which is the point of the sensor page.

## The short answer

| | |
|---|---|
| **Board** | Raspberry Pi **Zero 2 W** (512 MB, ARMv8) |
| **OS** | Raspberry Pi OS **Lite 64-bit** (Bookworm) |
| **Uplink** | Huawei **E3372h-320** HiLink stick + an external LTE antenna |
| **Cameras** | **IP cameras with RTSP**, never USB webcams |
| **Sensing** | **INA228** on the battery line, DS18B20 or TMP117 for temperature |
| **Clock** | DS3231 RTC module (optional, but cheap and it fixes timestamps) |
| **Budget** | **≈ 2.5–4 W** continuous → **60–95 Wh/day** |

Everything below is the reasoning behind that list.

## Which Raspberry Pi

**Zero 2 W — yes.** It is the recommended board, and `provisioning/README.md` already
names it: it has the hardware H.264 encoder (which the **Pi 5 does not**), it is the
lowest-power board that can still run a 64-bit OS and current Node, and the gateway is
not a heavy program. The service process measures **~54 MB RSS** running in sim mode,
so 512 MB is not the constraint people expect it to be.

**Zero W / Zero WH (the original) — no.** ARMv6, so no 64-bit Raspberry Pi OS and no
official Node builds. Nothing here will run on it. Do not buy one for this.

**Pi 3A+ — a reasonable fallback.** 512 MB, one USB-A socket (no OTG adapter needed),
hardware H.264, and it idles around 1.2 W. It costs roughly half a watt more than the
Zero 2 W in exchange for a real USB port.

**Pi 4 — buy it only if you need Ethernet or more than three camera streams.** It costs
about 2 W more, permanently. Over a year that is ~17 kWh, which on a small off-grid
setup is a panel-sized decision.

**Pi 5 — not for this.** Higher idle draw and no hardware H.264 encoder.

### What the Zero 2 W costs you

Four constraints, all of them manageable if you know about them before you order:

1. **512 MB of RAM, and the risky moment is `npm install`, not runtime.** The service
   itself is small; the update path (`git pull` + `npm install`) is what can hit the
   memory ceiling. Give the box **zram or a swapfile** before the first update — the
   installer does not currently set either up:
   ```bash
   sudo apt install -y zram-tools
   echo -e 'ALGO=zstd\nPERCENT=60' | sudo tee -a /etc/default/zramswap
   sudo systemctl restart zramswap
   ```
2. **One radio, 2.4 GHz only.** Access point *and* WiFi uplink at the same time is not
   reliable on the Broadcom chip (this is true of the Pi 4 as well). With an LTE stick
   as the uplink — deployment shape 1 in `docs/CONCEPT.md` — it does not matter, because
   the radio only ever does AP. Shape 2 (hanging off a FritzBox) wants Ethernet, which
   on a Zero means a USB adapter and therefore a hub.
3. **One micro-USB data socket (OTG).** The LTE stick needs a micro-USB-OTG adapter, and
   anything more than the stick needs a hub. Use the **PWR** socket for power, never the
   data one.
4. **No Ethernet.** See point 2.

## Power budget

Field values for a headless box, not measured here:

| Part | Continuous | Note |
|---|---|---|
| Pi Zero 2 W, idle | 0.4–0.7 W | headless, no HDMI |
| Pi Zero 2 W, AP + service + sensors | 1.0–1.5 W | the realistic figure for this project |
| Pi 3A+ | ~1.2–1.8 W | |
| Pi 4B | 2.5–3 W idle, 4–5 W busy | |
| LTE stick (E3372) | 1.5–2.5 W | **more when the signal is poor** — it transmits harder |
| DS3231 RTC | negligible | µA on its own cell |
| INA228 + friends | negligible | |
| IP camera (typical, PoE-less 12 V) | 3–5 W **each** | usually the largest single item |

**A Zero 2 W plus an LTE stick lands at roughly 2.5–4 W, i.e. 60–95 Wh/day.** Size the
battery from the high end and from your worst expected stretch of grey days, not from
the average.

### What actually saves power

In descending order of effect, which is *not* the order people usually try:

1. **Do not leave cameras running.** One always-on IP camera can cost more than the
   entire gateway. If they only matter when something happens, power them through one of
   the gateway's switches (Shelly / Tasmota / GPIO relay) and turn them on when you look.
2. **Give the LTE stick a proper external antenna.** A stick that has to shout burns
   watts continuously. Better signal is cheaper than a bigger panel.
3. **Pick the smaller board.** Zero 2 W instead of Pi 4 is ~2 W — real, but less than
   either of the above.
4. **Turn off what the board does not need:** HDMI (`video=HDMI-A-1:d` in
   `/boot/firmware/cmdline.txt`), the onboard LED, Bluetooth (`dtoverlay=disable-bt`) if
   you do not use it. This is tens of milliwatts. Do it, but do not expect much.
5. **Duty-cycling the whole box is tempting and usually wrong.** A gateway you cannot
   reach when you want it is not a gateway. If the battery is genuinely marginal, the
   honest fix is a bigger panel, not a box that sleeps through the moment you need it.

The sensor history is **not** a power concern: one row per minute is about 40 bytes, so
a full year is ~21 MB (`packages/gateway/src/sensors/history.ts`).

## Powering it, and surviving a brownout

This is where off-grid Pis actually die, so it gets its own section.

- **Feed the Pi from a proper 5 V buck converter** on the battery, rated for at least
  3 A even though the Pi will not draw it. Head-room is what survives the LTE stick's
  transmit spikes.
- **Do not power the LTE stick through the Pi** if you can avoid it. Its current spikes
  are what pull the Pi's 5 V rail down; that is the classic "Pi plus LTE stick" failure
  that corrupts SD cards. A powered hub, or a second buck output, keeps the two apart.
- **Watch the undervoltage flag.** The gateway reads `vcgencmd get_throttled`
  (`packages/gateway/src/system/health.ts:82`): bit 0 is under-voltage *now*, bit 16 is
  under-voltage *since boot*. The second one is the useful one — it catches a supply that
  sagged at 3 a.m. while nobody was looking. Both are on the setup page, and
  `undervoltage` can be an alert rule, so the box tells you before the card does.
- **Use the charge controller's low-voltage disconnect.** A clean cut at a sane threshold
  is much kinder than letting the rail decay slowly through the Pi's brown-out region.
- **Assume unclean shutdowns will happen** and reduce what is at risk: a good A2 card, no
  swap *on the SD card* (zram is in RAM, which is why it is preferred above), and the
  sensor history left off unless you want it — it is the only thing that writes
  continuously, and it is off by default for exactly this reason.
- **Unverified:** whether an SD card survives a season of brownouts on this build is not
  something this repository can claim. If the site is hard to reach, budget for a spare
  card with a known-good image in the box.

## The uplink

**HiLink sticks (Huawei E3372h-320, E8372, …)** are the tested path. The stick presents
itself as a network device with its own router at `192.168.8.1`, and the gateway proxies
its web UI on port 8081. Note how it is found: through `ip route get <host>`
(`packages/gateway/src/system/hilink.ts`), never by interface name — a LAN on another
`eth*` must not be mistaken for the stick.

**ModemManager modems** (APN, SIM PIN, network mode, roaming) are supported as the other
shape. Either works; the HiLink is the easier one to buy.

**Antenna matters more than the stick.** Two TS-9 pigtails to a directional antenna
pointed at the cell you actually get is the single best power-and-reliability upgrade in
this list.

**Carriers use CGNAT**, which is why Tailscale is the way in rather than a port forward.

## Sensors

The gateway's converters cover, and the setup page's *Detect hardware* button probes for:

- **Current/voltage:** INA219, INA226, INA260, **INA228** (recommended: 20-bit, 85 V bus,
  and it counts charge in the chip so a restart of the Pi does not lose the count),
  INA237/INA238 (same 85 V front end, charge integrated on the Pi instead).
- **ADC:** ADS1115 / ADS1015, for anything that is just a voltage divider.
- **Temperature:** DS18B20 (1-Wire), MCP9808, TMP102, TMP117.
- **Clock:** DS3231. Enable it with the checkbox on the setup page rather than an SSH
  session. Without it, a box that boots with no link timestamps its history from 1970,
  which makes a year of readings worthless.

Fit the INA228 **in the battery line**, so the sign of the current tells you charging
from discharging — that is what makes a state-of-charge number possible at all. Its 85 V
bus range means a 12 V or 24 V system needs no divider.

## Cameras

**IP cameras with RTSP.** The gateway passes those straight through
(`ffmpeg … -c copy`, `packages/gateway/src/video/cameraManager.ts:107`), so CPU cost is
near zero and even a Zero 2 W handles several.

**USB webcams get transcoded** (`cameraManager.ts:112`). On a Zero 2 W that means the
hardware encoder (`h264_v4l2m2m`), one camera, modest resolution — and it is the reason
the Pi 5, which has no H.264 encoder, is the wrong board here. If you have a choice, buy
IP cameras and never think about this again.

Video is explicitly not what this project is about; see `docs/CONCEPT.md`.

## A wiring sketch

```
 Solar panel
     │
     ▼
 Charge controller ──── low-voltage disconnect
     │
     ├──────────────► Battery (12 V)
     │
     ▼  load output
  [ INA228 shunt in this line ]
     │
     ├──► 5 V buck (≥3 A) ──► Pi (PWR socket)
     │                          │  micro-USB OTG
     │                          └──► LTE stick   ← powered hub or its own buck
     │                                                if the rail sags
     └──► 12 V ──► IP camera(s), switched via Shelly/Tasmota/GPIO relay
```

## What is not verified

Everything in this file is design guidance. Nothing here has run on a real site yet; the
hardware paths (I²C, nmcli, mmcli, rfkill, ping sweeps, `tailscale set`) are only
provable on the Pi itself. When you build one, the numbers on the sensor page are the
first thing worth checking against this budget.
