# YonderGate

An **off-grid site gateway** on a Raspberry Pi: it puts a remote place — a holiday
plot on solar, a cabin, a boat mooring — on your Tailscale network, serves its own
WiFi for the devices there, finds those devices, and lets you through to them.

> **Status: early but useful.** Provisioning, remote access, LTE, cameras and
> sensors come from [YonderRC](https://github.com/TechnikWeber/YonderRC); device
> discovery, subnet routing and per-device publishing are in. See
> [docs/CONCEPT.md](docs/CONCEPT.md) for the goal, [docs/HARDWARE.md](docs/HARDWARE.md)
> for what to buy and what it costs in watts, and the **TODO** below for what is
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
  **WiFi country** is set. **Devices on the hotspot also get internet** whenever the
  gateway has an uplink — see below.
- **LTE**: ModemManager modems (APN, SIM PIN, network mode, roaming, diagnostics)
  **and HiLink sticks** (Huawei E3372h-320 & friends) — found through the routing
  table, with their own web UI proxied through the gateway on port 8081.
- **Remote access**: Tailscale, ZeroTier or WireGuard, brought up at boot.
- **It can switch things off and on**: a Shelly, a Tasmota plug, any URL, or a relay
  on the GPIO — manually, or automatically when the device behind that switch stops
  answering. It is the only thing here that can *act* on a fault rather than report it.
- **It gets itself back online.** A watchdog probes whether traffic still reaches the
  outside — the only honest test, since an LTE session can be "up" and carry nothing —
  and escalates cheapest-first: bring Tailscale up, restart the network stack (which
  redials LTE), reboot as a last resort. **It cannot loop**: the reboot budget lives on
  disk (two a day, six hours apart), so a restart cannot reset it, and when a medium is
  simply gone the box stops reaching for the hammer and says so. A reboot is also skipped
  while somebody has the page open. Plus an optional weekly reboot.
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
- **Optional API secret** (Setup › Security — generate it there, or set `YGW_API_SECRET`)
  guarding every mutating call and the proxied device UIs. Reading is never gated, so the
  page always loads; you enter the secret in that same panel to unlock the browser tab,
  and once as `…:PORT/?secret=…` for a proxied device page. The status block at the top
  says whether a secret is set and whether this tab knows it.
  Status endpoints stay readable without it (so the page always opens), which is worth
  knowing for a site whose hotspot is open by default: the device list is visible to
  anyone in Wi-Fi range. Credentials are not — the ntfy topic and token are shown
  shortened. Set a secret and switch the hotspot off once the box is configured.
- **A page from the internet cannot act on the site**, even with no secret set. The
  browser is the one attacker already inside the network: a site the operator opens
  while their phone is on the gateway's hotspot could otherwise reboot the box or, via
  the device proxy, switch a relay — a relay is switched by a plain URL, so an `<img>`
  tag is enough. The gateway refuses anything a page elsewhere caused (`Sec-Fetch-Site:
  cross-site`, or an `Origin` from the public internet) unless it carries the secret.
  Requests without a browser behind them — curl, scripts — are unaffected.

## Three ways to get the site online

The gateway does not care which one you pick — everything else on this page works
the same way — but they differ in one thing worth knowing before you buy hardware.

| Uplink | What it is | The catch |
|---|---|---|
| **LTE stick** | The classic off-grid case: a SIM in a USB stick. | Metered, so set the allowance. |
| **Wi-Fi client** | The site already has Wi-Fi (a cabin, a neighbour, a marina). | **One radio, one job** — see below. |
| **Ethernet** | The site has a router of its own. | Nothing much; this is the easy one. |

> **The one-radio rule.** A Pi's built-in Wi-Fi can either *join* a network or *serve*
> its own hotspot — never both. So if you use Wi-Fi as the uplink, the onboarding
> hotspot cannot run at the same time, and devices at the site have to join the same
> Wi-Fi as the gateway. Three ways around it: put the devices on that Wi-Fi (usually
> fine), add a **second, USB Wi-Fi adapter** for the hotspot, or keep the built-in
> radio free by using LTE or Ethernet for the uplink. The gateway already refuses to
> start the hotspot while it is a Wi-Fi client rather than cutting its own link.

### Does the hotspot give devices internet?

**Yes — whenever the gateway itself has one.** The hotspot is created as a *shared*
connection, which means the Pi hands out addresses, answers DNS and NATs everything
onward through whatever uplink it currently has: the LTE stick, the site's router, or
Wi-Fi. So a phone or a laptop joined to `YonderGate-setup` browses normally, and a
camera on the hotspot can reach the internet if it needs to.

Two things worth knowing:

- **It comes out of the SIM.** Traffic from hotspot clients is mobile traffic like any
  other, and it is counted by the data page along with everything else. A guest who
  syncs a phone's photo library over the site's SIM is a real way to burn an
  allowance — which is why the allowance and the 80 % warning exist, and why the
  hotspot can be switched off (Setup › Wi-Fi) once the box is configured.
- **Without an uplink, it is a local network only.** The captive portal then answers
  every name with the setup page, which is the point: a phone that joins and finds no
  internet should land on the page that explains why, not on a browser error. The
  moment an uplink comes back the gateway notices (within a minute) and drops the
  redirect, so normal DNS resumes — the hotspot reconnects briefly while it does.

With Wi-Fi or Ethernet, set the data counter to **an interface** (or leave the
allowance empty — an unmetered uplink does not need one), and the LTE panels simply
stay empty.

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

**What to buy first:** a **Pi Zero 2 W**, a HiLink LTE stick with an external antenna,
IP cameras rather than USB ones, and an INA228 in the battery line — about 2.5–4 W all
together. The reasoning, the power budget and the wiring are in
[docs/HARDWARE.md](docs/HARDWARE.md) ([deutsch](docs/HARDWARE.de.md)).

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
- [x] Let alert rules be added, edited and deleted from the page
- [ ] Export a range of history as CSV from the page
- [ ] Alert state is in memory: after a restart, a breach that is still going sends
      one more message than it should
- [ ] Config backup / restore as one file
- [x] Camera preview on the setup page (still frame + link to go2rtc's player)

**Operations**
- [ ] Decide the license before this gets contributors (see docs/CONCEPT.md)
- [ ] Bilingual docs as in YonderRC — `docs/HARDWARE.de.md` is done, `README.de.md` is not
- [x] A hardware guide: which Pi, which LTE stick, solar/charge controller wiring, and
      what the whole thing costs in watts — [docs/HARDWARE.md](docs/HARDWARE.md)
- [ ] Power behaviour on brownout: described in the hardware guide, but **not verified** —
      and the installer still sets up no zram/swap, which a 512 MB Zero 2 W wants before
      its first `npm install`
