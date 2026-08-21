# YonderGate

An **off-grid site gateway** on a Raspberry Pi: it puts a remote place — a holiday
plot on solar, a cabin, a boat mooring — on your Tailscale network, serves its own
WiFi for the devices there, finds those devices, and lets you through to them.

> **Status: early.** The provisioning, remote access, LTE, camera and sensor layers
> are inherited from [YonderRC](https://github.com/TechnikWeber/YonderRC) and work.
> The parts that make it a *gateway* — device discovery, forwarding to discovered
> devices, subnet routing — are the next step. See [docs/CONCEPT.md](docs/CONCEPT.md)
> for what it is meant to become.

## What works today

- **Graphical setup page** served by the Pi (`/setup`) — no screen, no SSH.
- **AP onboarding**: the Pi opens its own hotspot (`YonderGate-setup`, open by
  default) with a captive portal, so a phone can configure it out of the box. It
  repairs the classic Raspberry Pi OS trap where WiFi stays rfkill-blocked until a
  **WiFi country** is set.
- **LTE**: ModemManager modems (APN, SIM PIN, network mode, roaming, diagnostics)
  **and HiLink sticks** (Huawei E3372h-320 & friends) — found through the routing
  table, with their own web UI proxied through the gateway on port 8081.
- **Remote access**: Tailscale, ZeroTier or WireGuard, brought up at boot.
- **Sensors**: voltage, current and temperature over I²C (INA2xx, ADS1115, and the
  usual temperature parts), or simulated when no hardware is attached.
- **Cameras** via go2rtc, configured graphically.
- **Update from the page**: check what is coming in, then pull and restart —
  designed for a site you reach only over LTE.
- **Optional API secret** guarding every mutating call and the proxied device UIs.

## Quick start (Raspberry Pi OS Lite, Bookworm)

```bash
curl -fsSL https://raw.githubusercontent.com/TechnikWeber/YonderGate/main/provisioning/bootstrap.sh | bash
```

Then open `http://<pi>:8080/setup` — or join the `YonderGate-setup` hotspot and let
the captive portal open it for you.

## Development

```bash
npm install
npm test          # pure logic: sensors, wifi, LTE, updater, proxy auth
npm run dev       # the service in sim mode → http://localhost:8080/setup
```

Nothing here needs hardware: every driver and sensor has a simulated
implementation, and the setup page is fully usable against it.
