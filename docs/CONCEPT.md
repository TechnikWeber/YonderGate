# YonderGate — what it is meant to be

*Captured from the owner's description, 2026-08-21. This is the reference for what
the project is for; everything in the code should be traceable back to something
here, and anything here that stops being true should be edited rather than
quietly ignored.*

## The situation

A remote holiday plot with **solar power** and no wired internet. A Raspberry Pi
sits there permanently and is the way in — for the owner, from anywhere.

## What it must do

**Be reachable.** Over **Tailscale**, from a laptop or phone anywhere. That is the
primary interface; there is no screen on site.

**Work in two deployment shapes, without a different setup for each:**

1. **Standalone.** The Pi carries an **LTE stick** (HiLink or ModemManager) and
   serves its **own access point**. Devices on site — IP cameras, sensors,
   whatever — join that AP. The Pi is their router and the only way in.
2. **Behind an existing router.** The Pi hangs off, say, an **LTE FritzBox** on
   the local network. Then it must give access to the Pi *and* to the FritzBox
   *and* to every other device on that LAN.

**Find what is out there.** *(implemented v0.2.0)* A **Scan** button, and a list of what answered:
IP, MAC, vendor, hostname, open ports worth knowing about. Both on its own AP and
on the LAN it is plugged into.

**Let me through to those devices.** *(implemented v0.2.0 — both mechanisms)* From the laptop, reach:
- the Pi itself,
- the **LTE stick's own web page** (APN, SIM PIN, signal),
- the **FritzBox** or whatever else runs the local network,
- **any discovered device** — an IP camera's web UI, a switch, an inverter.

Two mechanisms, and they are not equivalent:
- **Tailscale subnet routes** (`--advertise-routes`) — the native answer: the
  laptop reaches `192.168.4.x` and `192.168.178.x` directly, no per-device setup.
  Needs IP forwarding on the Pi and the route approved in the tailnet.
- **Per-device HTTP proxy** — what the HiLink stick already uses: the gateway
  publishes a device's web UI on a port of its own. Works without touching the
  tailnet's routing, and is the fallback when subnet routes are not wanted.

**Show the site's state.** Voltage, current, temperature — this is a solar
installation, so those numbers *are* the reason to look. Static values on the page
are enough; live is welcome but not required.

**Cameras.** One or more, configured graphically as in YonderRC. Video is
explicitly **not** the focus — being a good gateway is.

## What it must not carry

Everything the RC project needs and this one does not: channels, PWM/servo
drivers, arming and failsafe, the OSD, the ground control app, stick bindings,
GPS. Removed rather than left dormant — dead safety-critical code is worse than
no code.

## Where it comes from

Forked from **YonderRC** for its setup UI and its provisioning: AP onboarding with
a captive portal, WiFi country/rfkill repair, LTE (incl. HiLink sticks and their
proxied web UI), Tailscale/ZeroTier/WireGuard remote access, the update button,
sensor stack and camera handling via go2rtc. History was not carried over, but
`git remote add yonderrc …` is configured, so a fix from there can still be
cherry-picked.

## Open decisions

- **License.** Inherited CC BY-NC-ND + no-military from YonderRC. For a gateway
  that others might contribute to, a software license (AGPL, Apache-2.0) fits
  better. Decide before the repo goes public.
- **Discovery mechanism.** `ip neigh` + ARP is passive and instant; an active
  sweep (ping/`nmap -sn`) finds more but takes seconds and touches every host.
  Probably both, with the passive one as default.
- **Subnet routes vs proxy as the default** for reaching devices.
