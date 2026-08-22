# Data budget — what this box costs on a metered SIM

*The goal it is written against: **a message when something is wrong**, and the ability
to **dial in now and then** — look at a camera, see how full the battery is. In
standby it should cost as close to nothing as a connected box can. This page works out
whether that is achievable, what it costs where, and which kind of tariff fits.*

> Measured figures below were taken against the running gateway and are marked as such.
> Everything else is an order of magnitude, and says so. The gateway counts its own
> traffic (Setup › Mobile data, with a monthly allowance and a warning at 80 %) — that
> counter, not this page, is what should decide your tariff.

## The uncomfortable part, first

**"Reachable instantly" and "uses no data while idle" are in tension**, and no amount of
tuning removes it. A permanent tunnel is a permanent conversation: Tailscale holds a
long-poll to its control plane, keeps a DERP relay connection alive, and re-punches NAT
often enough that a carrier's CGNAT does not drop the mapping. None of that carries your
data, and all of it costs bytes.

So the real question is not "how do I get to zero" but **which of the two you want**, and
the answer can be different from what the box does today. Three shapes, further down.

## Where the bytes actually go

| Source | Cadence | Size | Per month |
|---|---|---|---|
| **Tailscale, idle** | continuous | keepalives | **tens of MB — the big unknown, measure it** |
| Watchdog probe | 2 pings / 5 min (default) | ~0.35 kB | **~3 MB** |
| ntfy alert | per alert | ~5–10 kB incl. TLS | ~0.2 MB at 20 alerts |
| NTP | adaptive, ≤ every ~34 min | ~0.2 kB | < 0.2 MB |
| Setup page, first load | per visit | **33 kB** (measured, gzipped) | — |
| Setup page, revalidated | per visit | **0 B body** (304) | — |
| Setup page, open tab | while visible | ~2 MB/hour (measured) | — |
| Camera still frame | per look | 50–200 kB | — |
| **Camera, live H.264 1080p** | while watching | **~15 MB per minute** | — |
| `apt` / unattended-upgrades | daily, if left on | **MB per day** | **can dwarf all of the above** |
| Discovery, AP traffic, sensor history | — | local only | **0** |

Four things are worth saying out loud about that table.

**The watchdog is not free.** Two ICMP echoes every five minutes is about 3 MB a month —
more than the entire alerting budget the owner asked for. It buys something real (it is
the only honest test of whether traffic still reaches the outside, and it is what gets
the box back online unattended), but on a lifetime-bundle SIM it is worth moving to 15 or
30 minutes. A site that has been down for twenty minutes instead of five is usually
survivable; a SIM out of credit is not.

**`apt` is the one nobody budgets for.** Raspberry Pi OS refreshes package lists daily and
unattended-upgrades downloads real packages. On a metered link that can be an order of
magnitude more than everything the gateway does put together. It is a genuine decision —
security updates versus a data budget — not something to switch off silently, so the
installer leaves it alone. If you decide against it:
```bash
sudo systemctl disable --now apt-daily.timer apt-daily-upgrade.timer
sudo systemctl disable --now unattended-upgrades   # if installed
```
and update deliberately, when you are looking, over the update button.

**Live video is in a different unit.** A minute of 1080p costs more than a month of
everything else. The still-frame preview on the setup page exists partly for this reason:
looking at a camera should cost 100 kB, and watching one should be a decision you make on
purpose.

**Tailscale idle is the unknown that matters most.** It has not been measured on this
build, and it is very likely the largest continuous item. Before committing to a tariff,
run the box for a week and read Setup › Mobile data.

## What changed to make this cheaper (v0.12.5)

Two measured wins, both in this repository:

- **The page is compressed and revalidated.** `/setup` went from **121.9 kB to 33.1 kB**
  on the wire, and an unchanged page now answers **304 with no body** instead of sending
  those kilobytes again. `/api/health` halved (1.6 kB → 0.8 kB). Bodies under 512 bytes
  are left alone, where gzip is noise.
- **The page stops polling when you are not looking at it.** It polls `/api/system` every
  3 s, sensors every 5 s and health every 30 s — about **2 MB an hour**. A tab forgotten
  overnight was ~17 MB, which on a SIM sold with 500 MB for its entire life is a
  noticeable bite. Hiding the tab now stops every poll; showing it refreshes at once, so
  nothing on screen is quietly stale.

## Three shapes, and what each one costs you

**A — Tailscale always up (what the box does today).** Reachable in seconds, nothing to
think about, and the standby cost is whatever Tailscale's keepalives come to. Right for a
tariff with a monthly allowance.

**B — Alerts only, woken by SMS (not implemented; the interesting one).** In standby the
box holds no tunnel at all: it sends an ntfy alert when something is wrong — a direct
HTTPS POST, a few kB, no VPN involved — and otherwise uses **no data whatsoever**. To get
in, you text the SIM; the gateway reads the message off the modem (`mmcli` or the HiLink
SMS API — SMS travels on the signalling channel and costs no data at all), brings
Tailscale up for a set number of minutes, and drops it again. That is genuinely near-zero
standby with on-demand access, and it needs a tariff that includes SMS.

It also needs care, because it can build a box you cannot reach: the wake path must have
a **fallback that does not depend on it** — a scheduled window (below) that opens anyway,
a sender whitelist plus a secret in the message text so a wrong number cannot open your
tunnel, and the existing watchdog left in charge underneath.

**C — Scheduled windows.** Tailscale comes up for ten minutes, three times a day. No SMS
needed, costs a known amount, and you wait for the next window. Weakest on its own, but
it is the right *fallback* under B — with C underneath, a broken SMS path costs you a few
hours, not a drive to the site.

**B with C underneath is the design that matches what you asked for.** It is not built
yet; A is what ships.

## Choosing a tariff

In the order that actually matters:

1. **No deactivation for inactivity.** This is the trap, and it is exactly backwards from
   what consumer prepaid does: a SIM that uses almost nothing gets switched off for using
   almost nothing, or its credit expires. A box designed to be silent must not be on a
   tariff that punishes silence.
2. **SMS in and out included.** Without it, shape B is impossible. It is also a decent
   last-resort "are you alive" channel when data is broken.
3. **How the carrier meters.** Ask about **per-session rounding**: a tariff that rounds
   every session up to 10 or 100 kB turns a 350-byte watchdog probe into a 100 kB one and
   destroys this whole design. Per-kB or pooled billing is what you want.
4. **Headroom for the camera habit you will actually have**, not the one you plan to have.
5. **Coverage at the site.** Test with a phone on that carrier *before* buying, standing
   where the box will stand. A stick that has to transmit hard also burns watts
   ([docs/HARDWARE.md](HARDWARE.md)); coverage is a power decision as much as a data one.
6. **Not NB-IoT / LTE-M only.** Those tariffs look perfect for a sensor box and cannot
   carry a camera frame or a Tailscale session.
7. **CGNAT is fine — do not pay for a public IP.** Tailscale exists precisely so you do
   not need inbound reachability.
8. **EU roaming**, if the site is abroad.

### The options, as categories

**IoT lifetime bundle** (1NCE and similar: a few hundred MB plus SMS, valid ~10 years, one
payment, no monthly fee). Built for exactly this: no inactivity trap, SMS included, and
nothing to keep topping up. 500 MB over ten years averages ~4 MB a month — comfortable for
alerts, watchdog at a sane interval and the occasional still frame; **not** enough for live
video or a habit of leaving the page open. The strongest fit for the requirement as stated.

**Consumer prepaid** (supermarket brands and friends). Cheapest per gigabyte and the worst
fit here: credit expires, inactive SIMs get deactivated, and you inherit a yearly ritual
you must not forget while the box sits in a field.

**Carrier M2M / IoT contract.** A small monthly fee, per-MB or pooled metering, SMS
available, no inactivity kill, management portal. The right answer if dialling in becomes
routine rather than rare. Ask specifically about rounding and about SMS.

**An ordinary phone tariff in the box.** Overkill and over-priced for standby — but the
honest choice if you will genuinely watch live video.

### The recommendation

**Start with an IoT lifetime bundle that includes SMS.** It matches the stated requirement
(alerts, rare look-ins), it cannot be killed by inactivity, and it is the tariff that makes
the SMS wake in shape B possible later. Pair it with: watchdog at 15–30 minutes, `apt`
timers off, snapshots rather than live video.

**Then measure for a week and re-decide.** If Tailscale's idle keepalives turn out to be
tens of megabytes a month, that bundle will not last ten years on shape A — and that is
the number that tells you whether to build shape B or simply buy a monthly allowance.
The counter is already in the page; use it before spending money.

## Not verified

The measured page and API figures come from the running gateway. The watchdog, NTP, alert
and camera figures are calculated from packet sizes and cadences, not captured on a real
LTE link. Tailscale's idle consumption is not measured at all. Nothing here has run on a
real site yet.
