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
- **It gets itself back online.** A watchdog probes whether traffic still reaches the
  outside — the only honest test, since an LTE session can be "up" and carry nothing —
  and escalates cheapest-first: bring Tailscale up, restart the network stack (which
  redials LTE), reboot as a last resort. Plus an optional weekly reboot, guarded so a
  box that just booted cannot loop.
- **It speaks up when something is wrong** (ntfy push): the battery under a
  threshold, a saved device gone quiet, the supply sagging, the SIM's allowance at
  80 %. Every alert waits until the condition has held, then stays quiet for six
  hours — a flaky link must not become a night of notifications.
- **Site health**: disk, CPU temperature, load, uptime, **undervoltage** (the classic
  Pi-plus-LTE-stick failure that eats SD cards) and whether the **clock is actually
  synced** — a year of history is worthless if the timestamps came from a box that
  booted in 1970. NTP servers are set from the page; a DS3231 RTC is detected if you
  fit one.
- **Mobile data counter** with a monthly allowance: the stick's own figure or the
  kernel's interface counters, kept as a running total that survives either side
  resetting.
- **Sensors with history**: voltage, current and temperature over I²C (INA2xx,
  ADS1115, and the usual temperature parts), or simulated when no hardware is
  attached — recorded once a minute and kept for 13 months, so the page can answer
  "and yesterday?" as well as "and now?". Charts for hour, day, week, month and year,
  drawn in the page itself so they work with no internet at the site.
- **Cameras** via go2rtc, configured graphically, with a still-frame preview and a
  link to the live player right in the page. `npm run dev:video` runs the whole
  thing locally against a simulated camera.
- **Update from the page**: check what is coming in, then pull and restart —
  designed for a site you reach only over LTE.
- **Optional API secret** guarding every mutating call and the proxied device UIs.

## How you reach your devices

The whole point of this box, explained from scratch.

### The problem

The things at your site — a camera, the router, an inverter — have addresses like
`192.168.4.23`. Those addresses exist **only at that site**. Millions of networks use
the same numbers, so the internet cannot deliver anything to them: there is no way to
say *which* `192.168.4.23` you mean.

The classic answer is "forward a port on the router". That does not work here either:
an LTE connection almost never gives you a public address of your own — you share one
with hundreds of other customers (carrier-grade NAT). There is no door to open.

### The idea: your own private network

**Tailscale** builds a private network across your devices, wherever they are. Install
it on the gateway and on your laptop and phone, log all of them into the same account,
and each gets a permanent address like `100.126.76.112`. They can talk to each other
directly, encrypted, with **nothing opened on any router**. It works from behind CGNAT,
behind a company firewall, from a hotel — because both ends dial out.

That already gets you to **the gateway itself**: `http://yondergate:8080/setup` from
your sofa. Getting to everything *behind* it is the part this project is about, and
there are two ways.

### Way 1 — Subnet routes: reach everything, at its real address

You tell your private network: *"this gateway can also reach 192.168.4.0/24."* From
then on your laptop talks to `192.168.4.23` directly, exactly as if you were standing
at the site. One setting, every device, including things that are not web pages at all
— RTSP cameras, SSH, an inverter's app.

**How to set it up**

1. On the gateway: **Setup › Site network › Reach these networks over Tailscale**.
   Tick the networks you want (usually the one your devices are on) and press
   **Apply routes**. The gateway turns on IP forwarding for you.
2. In the Tailscale admin console: **Machines → your gateway → ⋯ → Edit route
   settings → approve** the route. *This step is not optional and it is the one
   everybody forgets* — until it is approved, the route exists and carries nothing.
   The page tells you when it is waiting.
3. On a **Linux** client, accept routes once: `sudo tailscale up --accept-routes`.
   (macOS, iOS, Windows and Android accept them by default.)
4. Test it: open `http://192.168.4.23/` on your laptop, from anywhere.

**When this is not the right way:** if the site uses the same address range as the
network you are sitting in — both `192.168.178.x`, say — your laptop cannot tell the
two apart, and the route collides with your own LAN. Then use way 2.

### Way 2 — Publish one device: the fallback that always works

The gateway offers **one device's web page on one of its own ports**. You only ever
talk to the gateway, which Tailscale already gets you to.

**How to set it up**

1. **Setup › Site network → Scan**, find the device in the list.
2. Give it a name and, if its web UI is not on port 80, its port. **Save**.
3. Press **Publish**. The page tells you the port it picked, e.g. `8100`.
4. Open `http://yondergate:8100/` from anywhere on your tailnet.

No routing changes, no approval, no address collisions — and if an API secret is set,
that port asks for it too (open it once as `…:8100/?secret=YOUR_SECRET`).

Its limits are worth knowing: it only forwards **HTTP(S)**, one device per port, and
the device sees the gateway as its visitor rather than you.

### Which one to use

| | Subnet routes | Publish a device |
|---|---|---|
| Reaches | **every device, every protocol** | one device's web page |
| Setup | once, per network | once, per device |
| Needs approval in the admin console | **yes** | no |
| Survives an address collision with your home network | no | **yes** |
| Good for | the normal case | one camera, or when routing is not an option |

Use subnet routes if you can, publishing if you must — and note that you can do both
at the same time.

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
- [x] Remember discovered devices between scans: names, ports, and a saved device that
      stops answering stays in the list with the time it was last seen
- [ ] HTTPS devices: the proxy currently talks plain HTTP to the target
- [ ] mDNS/avahi names in the device list, not just reverse DNS

**Site monitoring**
- [x] Sensor history: one averaged value per minute, kept 13 months (~21 MB a year),
      with min/max per step and hour…year views — **off by default**, because it is the
      only thing that writes to the card continuously
- [x] **Alerts** over ntfy, with a hold-down and a cooldown so a flaky link cannot
      turn into a night of notifications
- [x] **System health**: disk, temperature, load, uptime, undervoltage, clock sync,
      RTC detection, NTP servers settable from the page
- [x] **Mobile data counter** with an allowance and a warning at 80 %
- [ ] Alert when the **uplink itself** is gone — needs a way to notice after the fact,
      since a box with no link cannot send anything while it is down
- [x] Time on the page: current time, timezone, the servers actually in use, and a
      **DS3231 hardware clock enabled with a checkbox** rather than an SSH session
- [x] Interface picker for the data counter, and a "used / left / days to go" line
- [ ] Let alert rules be added from the page (thresholds and devices are configurable
      in the config file today, the defaults cover supply and data)
- [ ] Export a range of history as CSV from the page
- [ ] Config backup / restore as one file
- [x] Camera preview on the setup page (still frame + link to go2rtc's player)

**Operations**
- [ ] Decide the license before this gets contributors (see docs/CONCEPT.md)
- [ ] Bilingual docs (`README.de.md`, `docs/HARDWARE.de.md`) as in YonderRC
- [ ] A hardware guide: which Pi, which LTE stick, solar/charge controller wiring
- [ ] Power behaviour: what happens on brownout, and does the SD card survive it
