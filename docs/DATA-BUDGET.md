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

**A — Always live (the default).** Reachable in seconds, nothing to think about, and the
standby cost is whatever the tunnel's keepalives come to. Right for a tariff with a
monthly allowance.

**C — A window (shipped in v0.12.6, Setup › Remote access).** The tunnel stays down and
alerts are **held on disk**; when the window opens they arrive as one grouped message and
the box is fully live until it closes. Default **Sundays 14:00–14:15**, and day, time and
length are settings. What it costs is known in advance, and what you give up is knowing
about a problem before the window.

It is built so it cannot be the reason nobody can reach the box: the tunnel also stays up
for ten minutes after **every restart**, it is never taken down while somebody has the
page open, and *Open now for 30 min* overrides it from the page. The held alerts are
written to `/var/lib/yondergate/alert-buffer.json`, so a reboot on Wednesday does not lose
Tuesday's alert, and a flush that fails keeps them for the next attempt.

**B — Woken by SMS. Parked, deliberately (2026-08-22).** The idea: instead of waiting for
Sunday you text the SIM, the gateway reads the message off the modem (`mmcli` or the HiLink
SMS API — SMS travels on the signalling channel and costs no data at all) and opens the
tunnel for a set number of minutes.

It was dropped on the tariff, not the code. **The wake channel is only as reliable as the
SIM's ability to receive an SMS**, and the products a private customer can actually buy
(see below) do not dependably come with a usable number — data-only M2M tariffs frequently
have no MSISDN at all. A way in that works until the day you need it is worse than not
having one, so the window is the answer and B stays written down rather than built.

Most of it would have been small, for the record: the HiLink session-and-token dance is
already implemented (`system/hilink.ts`), and the action is `uplink.openFor()`, which
shipped with C. What was missing was a POST helper, an SMS-list parser, and a service.

**C is what ships.**

## Choosing a tariff

In the order that actually matters:

1. **No deactivation for inactivity.** This is the trap, and it is exactly backwards from
   what consumer prepaid does: a SIM that uses almost nothing gets switched off for using
   almost nothing, or its credit expires. A box designed to be silent must not be on a
   tariff that punishes silence.
2. ~~**SMS in and out included.**~~ Dropped as a criterion (2026-08-22): the tariffs a
   private customer can actually buy do not reliably come with a number that can receive
   SMS, which is also why shape B below is parked. Do not pay extra for it.
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

**IoT lifetime bundles are closed to private customers.** This is worth knowing before
you go looking: 1NCE ("10 euros for 10 years", 500 MB plus 250 SMS on the Telekom
network) and o2's equivalent *Easy IoT* (11.90 € for ten years, 750–1500 MB depending on
the region) are **business-customer products**. Both are exactly the right shape for this
box and neither will sell to a consumer. If a small business registration exists anyway,
they reopen — that is a fact about the products, not a suggestion about paperwork.

What is left for a private customer is three shapes:

**A pay-per-use IoT SIM you can actually buy** — Things Mobile is the one that keeps the
1NCE *shape*: no monthly fee, credit that does not expire, orderable by an individual.
The price is the catch. It bills roughly 10 ct per MB, and usage **below 5 MB a month
costs another 10 ct on top** — so a box designed to be quiet is billed at the worst rate,
about 20 ct per MB. At 5 MB a month that is ~1 € a month, which is fine; at 100 MB it is
20 €, which is not. teltarif's test also only ever got HSPA on Vodafone rather than the
advertised LTE. Right shape, wrong price, mediocre network.

**Ordinary consumer prepaid, chosen for its inactivity rule rather than its price.** The
rule is the whole decision, and the figures differ wildly:

| | Deactivated after | Note |
|---|---|---|
| Telekom prepaid | **24 months** | longest window, best coverage at a remote site |
| congstar (Telekom network) | 15 months | cheaper, same network |
| Aldi Talk | 4–24 months | scales with the top-up: 5 € → 4 months, 30 € → 2 years |
| Lidl Connect | 6–12 months | by top-up size |
| o2 prepaid | 6 months | short |
| Vodafone CallYa | **90 days** | unusable for a box that is meant to be quiet |

**The trap is in the small print, and it is not the one you would guess: most providers
count a top-up, not usage.** A gateway that quietly uses 5 MB a month can still be
switched off for inactivity, because nothing was *paid*. So the criterion is not "does it
use data" but "when do I next have to put money on it" — and that is a calendar reminder
you must not lose, while the box sits in a field.

**Inside a prepaid tariff there are then two ways to pay for the data, and for a box
like this they are not close.** You load credit — the top-up is what resets the
inactivity clock — and then either:

- **a data pack**: a flat for four weeks, from about 2 € (congstar, Telekom network) or
  3 € for a few GB from the cheap o2-network brands;
- **no pack at all**, billed per megabyte. That is **3–5 ct/MB** in an ordinary German
  tariff (congstar ~5 ct, Vodafone CallYa ~3 ct) — four to seven times cheaper per MB than
  the pay-per-use IoT SIM above.

Put our measured numbers against that. In window mode the standby is the watchdog and NTP:
call it 5–20 MB a month, so **25 ct to 1 € per month at 5 ct/MB**. The watchdog at five
minutes costs about 15 ct a month; an hour with the page open costs about 10 ct. A 1 GB
pack at 3–4 € is four to sixteen times that for volume you will not touch. **Per MB wins
until you use roughly 60–130 MB a month** — that is the break-even, and it is exactly the
point where looking at cameras stops being rare.

Two things decide it beyond the arithmetic:

- **An auto-renewing pack is the top-up.** It is the revenue event the provider counts, so
  it keeps the SIM alive by itself and there is no yearly ritual to forget. That is worth
  real money against the risk of losing the card.
- **Per MB has no ceiling — except the credit, which is the point.** A camera stream you
  forgot to close, an `apt` upgrade, a retry loop: billed straight through. On prepaid the
  damage stops at the credit on the card, which is a genuine safety property, but the box
  is then offline until you notice. Ask about **per-session rounding** before choosing
  this: a tariff that rounds every session to 10 or 100 kB turns our 350-byte watchdog
  probe into a 100 kB one and reverses the whole calculation.

**A small monthly data tariff, cancellable monthly.** Boring, predictable, no inactivity
rule to track at all, and enough headroom that looking at a camera stops being a decision.
Cheapest as of August 2026, and worth re-checking because these move constantly:

| | | |
|---|---|---|
| **~2.99 €/month, 3 GB** | o2 network | sim.de / winSIM / PremiumSIM, monthly cancellable, no setup fee — the cheapest thing on the market |
| **~2 €/month** | **Telekom network** | congstar prepaid data — dearer per GB, better reach where it matters |
| ~3.99 €/month, 1 GB | various | small packs are rarely worth it; 3 GB usually costs less than 1 GB |

**And the one that looks like the answer and is not:** GMX FreePhone advertises 3 GB for
**0 €**. It is **eSIM only**, which a HiLink stick cannot take at all, and the price holds
only while you open the GMX mail app on ten days a month, is guaranteed for twelve months,
and comes with an auto-top-up that buys 1 GB for 1.99 € when the 3 GB run out. Somebody
will find it and suggest it; it does not fit this box.

### The recommendation

**Coverage first, tariff second.** At a remote plot the network that actually reaches the
box decides more than the price does — and a stick that has to transmit hard also burns
watts ([docs/HARDWARE.md](HARDWARE.md)). Test with a phone, standing where the box will
stand, before buying anything.

Given that, **a prepaid SIM on the Telekom network — congstar, or Telekom's own if
coverage is marginal** — is the best fit for "alerts plus the occasional look": good
reach, a 15- or 24-month window that one top-up a year satisfies, and per-GB prices an
order of magnitude below the pay-per-use IoT SIMs.

**Start on per-MB billing with no pack**, because in window mode the box costs well under
a euro a month there, and let the data counter tell you when you cross ~100 MB a month.
Then switch to the smallest **auto-renewing pack**, which from that point is both cheaper
and the thing that keeps the SIM alive on its own. Until you switch, put the top-up date
in a calendar the day you install the box — that reminder is the only maintenance this
path asks of you, and it is the one that strands the box if you lose it.

**Take Things Mobile instead if the yearly ritual is what you want to avoid** and you can
hold yourself to a few MB a month. It is the only consumer product with the "pay once,
forget it" feel, and you pay roughly ten times over for it.

**Then measure for a week and re-decide.** If Tailscale's idle keepalives turn out to be
tens of megabytes a month, the cheap end of this list stops being cheap — and window mode
(Setup › Remote access) is the answer, because it takes exactly that item to zero. The
counter is already in the page; use it before spending money.

## Not verified

The measured page and API figures come from the running gateway. The watchdog, NTP, alert
and camera figures are calculated from packet sizes and cadences, not captured on a real
LTE link. Tailscale's idle consumption is not measured at all. Nothing here has run on a
real site yet.
