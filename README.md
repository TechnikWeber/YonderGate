# YonderGate

An **off-grid site gateway** on a Raspberry Pi: it puts a remote place — a holiday
plot on solar, a cabin, a boat mooring — on your Tailscale network, serves its own
WiFi for the devices there, finds those devices, and lets you through to them.

> **Status: early but useful.** Provisioning, remote access, LTE, cameras and
> sensors come from [YonderRC](https://github.com/TechnikWeber/YonderRC); device
> discovery, subnet routing and per-device publishing are in. See
> [docs/CONCEPT.md](docs/CONCEPT.md) for the goal and the **TODO** below for what is
> still missing. Nothing here has run on a real site yet — the hardware paths
> (nmcli, ping sweeps, Tailscale routing) are only verifiable on the Pi itself.

## What works today

- **Find what is on site**: *Scan* reads the kernel's neighbour table (instant),
  *Scan + sweep* pings the whole subnet for the quiet ones. The list shows address,
  hostname, vendor, what answered, and a one-line guess at what a device is.
- **Reach those devices two ways**: **Tailscale subnet routes** — advertise the
  site's networks and every device is reachable at its real address from anywhere on
  your tailnet — or **publish a single device** on a port of the gateway, which needs
  no routing changes at all.
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
- **Cameras** via go2rtc, configured graphically, with a still-frame preview and a
  link to the live player right in the page. `npm run dev:video` runs the whole
  thing locally against a simulated camera.
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

## TODO

The living list of what is open. Ticked items are done and covered by tests.

**Gateway core**
- [x] Device discovery: neighbour table, optional ping sweep, vendor and port probing
- [x] Tailscale subnet routes incl. IP forwarding, with the "approve it in the admin
      console" step spelled out
- [x] Publish a single device on a gateway port (the routing-free fallback)
- [ ] Verify all of the above **on the real Pi** — sweeps, `tailscale set`, forwarding
- [ ] Remember discovered devices between scans (names you gave them, what you published)
- [ ] Let the operator name a device and pick its port (not just 80)
- [ ] HTTPS devices: the proxy currently talks plain HTTP to the target
- [ ] mDNS/avahi names in the device list, not just reverse DNS

**Site monitoring**
- [ ] A sensible page for a solar site: battery voltage, charge/discharge, temperature
      history rather than just current values
- [ ] Alert when the battery goes below a threshold (push? e-mail? Tailscale-only?)
- [x] Camera preview on the setup page (still frame + link to go2rtc's player)

**Operations**
- [ ] Decide the license before this gets contributors (see docs/CONCEPT.md)
- [ ] Bilingual docs (`README.de.md`, `docs/HARDWARE.de.md`) as in YonderRC
- [ ] A hardware guide: which Pi, which LTE stick, solar/charge controller wiring
- [ ] Power behaviour: what happens on brownout, and does the SD card survive it
