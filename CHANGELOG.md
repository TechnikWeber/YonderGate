# Changelog

All notable changes to YonderGate.

## Unreleased
- **License is now AGPL-3.0-or-later.** YonderGate had inherited YonderRC's
  CC BY-NC-ND text, vehicle warnings included. Modifying, sharing and commercial use are
  now allowed; a modified version that is passed on or run for others over a network
  must publish its source. Notes that are not part of the license moved to `NOTICE.md`.

## v0.18.1
- **Fixed: an unreadable sensor read as a healthy one.** `Number('')` is 0, not NaN — so
  an empty `/sys/class/thermal/…/temp` came back as a comfortable **0 °C**, an empty
  `/proc/loadavg` as an idle **0.00**, and an empty `/proc/uptime` as a box that booted
  this instant. All three now check for an empty read first and report *unknown*. Found
  by the tests written while porting these parsers to YonderRC.

## v0.18.0
- **One device off the internet**, not just a whole interface. Each row in the site
  network list has a **Block internet** button; the device keeps talking to everything
  local and to your tailnet, and reaches nothing outside. Matched by **MAC**, so it
  follows the device across DHCP leases — and so it only works while the device is on a
  network this gateway serves. A device behind a router has no MAC here and the button is
  not offered, with the reason said out loud rather than the block failing quietly.
- **Traffic per interface**, next to the mobile-data counter. The uplink counter says what
  the month costs; this says which side of the box produced it — the hotspot, the site
  LAN, or the uplink itself. It counts everything on the interface, including what never
  left the site, so it is a comparison rather than a bill; the kernel resets it on reboot,
  which with the default weekly schedule means a week at most.

## v0.17.0
- **The hotspot's own subnet is now a setting**, and it matters more than it looks. A
  Tailscale subnet route carries the site's **real** addresses to your tailnet — a camera
  on 192.168.4.15 here is 192.168.4.15 from your laptop at home. That is what makes the
  route worth having, and it collapses if the network you are sitting in uses the same
  range: the address is already something on your own desk and the route can never win.
  Five choices are offered with their collision risk written out — 192.168.4.0/24 (what
  every Pi hotspot uses), 192.168.1.0/24 and 192.168.178.0/24 (marked as likely to be the
  network you connect *from*), plus **10.83.7.0/24** and **172.29.13.0/24**, which are
  deliberately obscure. Anything private can be typed instead. The subnet-routes list now
  flags a risky range where you actually decide to advertise it.
- **Internet per interface, on by default**: the hotspot and the wired site LAN can each
  be switched off. Off means no internet for those devices — while they stay reachable
  from the tailnet and from this page, which is the whole reason to switch it there
  rather than pull the route. Useful for a camera that phones home, or a plug that
  decides to pull firmware over a metered SIM. The filter matches on **destination**, so
  it survives a failover between LTE and Ethernet, and it is re-applied at every start
  because a firewall rule does not survive a reboot.
- **An AP with its internet off gets the captive portal back.** It is an internet-less
  network whatever the gateway's uplink is doing, so a phone joining it now lands on the
  setup page instead of silently failing at every connection.

## v0.16.1
- **Fixed: renaming the site looked like it had failed.** `POST /api/config` wrote the new
  site name and video base URL to the file but never applied them, and `GET /api/config`
  answers from the running config — so the next page load showed the old values back in
  the fields, which is exactly what a dropped save looks like. Both are applied live now
  (the alert sender takes the site name per message, the camera writer the URL per write,
  so neither needs a restart). Same class of bug as YonderRC v1.60.1; a test now checks
  that every field this endpoint accepts is applied, not only saved.
- **The hardware guide says what the shunt field actually is**: a calibration factor, not
  a datasheet value. Read the resistor off your own board (`R002` = 0.002 Ω) and correct
  it against a reference meter — on a box that counts amp-hours for months, 5 % wrong in
  that one field is 5 % wrong in everything it ever records. It also says where the I²C
  address goes and why a second INA has to move off 0x40.

## v0.16.0
- **The I²C chips are asked what they are, not guessed from their address** (ported from
  YonderRC v1.60.0). Every INA2xx leaves the factory on 0x40 and 0x48–0x4b is shared by
  ADS1x15 and TMP117 — so "0x40" was never an answer. `probesFor` + `identifyI2c` read the
  ID registers, a confirmed row is marked **✓ INA228 rev 1 — identified from its ID
  register**, and **Use these addresses** fills the sensor form from what actually
  answered. Pure and unit-tested; the `i2ctransfer` reads are hardware-only-verifiable.
- **Picking a sensor fills in values instead of empty fields**: `ina228` brings the 2 mΩ
  shunt the common 85 V breakouts carry and a 20 A range, and the **I²C address** is now a
  field on every voltage and current channel — it was temperature-only.
- **The setup page is eight tabs** — Overview · Site network · Sensors · Camera · Network ·
  Remote access · Health & alerts · **Design** — each one a URL (`…/setup#sensors`). The
  long explanations are folded behind a one-line summary, and the strip wraps rather than
  scrolling, because a mouse wheel cannot scroll a horizontal box.
- **Light and dark, chosen on the gateway.** Light is the default. The choice is stored in
  `config.theme`, not in the browser: this box is set up once and then opened from whatever
  phone is to hand, and a per-browser toggle would mean it looks different every time.
- **Last seen for every device that ever answered**, not just the named ones, with a
  per-device **Check** button that probes that one address now. Both only ever run because
  someone asked — nothing polls the site's network in the background. Devices nobody named
  are remembered too, capped at 64 so a site with visitors cannot grow the config forever.
- Fixed: the Tailscale route rows stacked their checkbox, CIDR and interface on three
  lines. `.route` set `display:flex` but never overrode the `flex-direction: column` it
  inherited from the `label` rule above it.
- Sensor copy that came from a model aircraft is gone: no more blackbox columns, no OSD,
  no `ESC` as an example label.

## v0.15.1
- **The READMEs have screenshots now** — they had none at all, which for a project whose
  whole surface is one page was an odd omission. Two, in both languages: the setup page
  with system status and the site-network panel, and the site-health readings.
- Both READMEs describe the **thermal clamp** next to under-voltage, and the **clean
  shutdown**; the TODO says so too. Taken with headless Chrome against the simulator, so
  they can be retaken the same way after the next change rather than depending on someone
  having hardware to hand.

## v0.15.0
- **Heat is now told apart from a sagging supply.** The firmware clamps the Pi's clock for
  two completely different reasons, and `parseThrottled` only ever read the two
  under-voltage bits. A box in a sealed enclosure in the sun — the normal case for this
  project — would have reported *supply: ok* while crawling at 600 MHz: the same slow,
  flaky behaviour, with a fix that has nothing to do with the battery. Bits 2 and 3 are
  read as well now, shown as their own **clock speed** row, and watched by their own alert
  rule (`health:thermal`, on by default for a new box).
- `explainClamp()` says which one it is in words that point somewhere: a sag at the battery
  under load, an undersized buck converter or a long thin run from the panel; heat at
  shade, a vent or a heatsink. The tests assert that the heat message never mentions the
  supply, because that is the whole point of separating them.
- **Shut down gateway** (Setup › System). Cutting power to a Pi mid-write is how an SD card
  in a box on a pole becomes a drive out there with a card reader. The warning is sized for
  a remote site: it does not come back on its own, and someone has to be at the box.

## v0.14.3
- **Removed `scaleCamera`.** It came across with the fork and scaled a camera's resolution
  and bitrate for a quality level requested by a ground station — which this project does
  not have and is not going to have. Nothing outside the tests called it, so it was code
  that described a feature the gateway does not offer. Its three tests and their fixture
  went with it.

## v0.14.2
- **The camera row stopped talking about the IMX519 under every other sensor** — same
  fix as YonderRC v1.54.1, and the same bug, because the row was ported from there. The
  tuning-file placeholder and the note underneath were hardcoded, so an OV5647 was offered
  an Arducam's file path and told about an autofocus algorithm it has no motor for. Both
  now follow the selected CSI module.
- **Focus controls only where there is a lens to move.** A module naming one sensor
  without an actuator says so instead of offering a dropdown that does nothing;
  auto-detect and a custom overlay keep the controls, since either might turn up an
  IMX708. A focus value already stored stays visible and editable.
- The camera rows re-render when the module selection changes, so the two follow each
  other without a page reload.
- YonderRC's other fix of the day (v1.54.2, auto video quality freezing the picture) has
  **no counterpart here**: the gateway has no ground station, no WebRTC panel and no
  auto-quality controller. `scaleCamera` is inherited from the fork and currently has no
  caller outside the tests.

## v0.14.1
- **The update button no longer uninstalls the sensor driver.** `i2c-bus` is an
  optionalDependency, and the update runs `npm install --omit=optional`, which prunes it.
  `install.sh` puts it back from the recorded `hardwareDeps`; the in-app update never did,
  so pressing *Update & restart* silently dropped a configured gateway back to simulated
  sensors until someone reinstalled it by hand. `updateSteps` now appends a restore step
  after the pruning install, through the same allowlist as `hwDeps.ts`
  (`restorableHwDeps`) — the value comes from a config file and ends up in an npm command
  line, so it is never passed through unchecked.
- The gateway's allowlist is `i2c-bus` alone: it drives no servos and no SBUS, so
  YonderRC's `pigpio` and `serialport` are modules this box should never install, and the
  tests say so.
- Same fix as YonderRC v1.50.0, where it was found on real hardware after an update had
  quietly removed the PCA9685 driver.

## v0.14.0
- **Camera handling is now the same on both platforms**, ported from YonderRC
  v1.52.1–v1.54.0 and verified there on a Pi 4B.
- **Rotation and mirroring per camera**: 0° / 180° plus independent horizontal and
  vertical mirrors, for CSI and USB alike. A camera bolted under a roof edge upside down
  is the normal case for a site gateway. It is one transform, not three options — a 180°
  rotation *is* both mirrors, so all three settings collapse into two booleans before
  anything is emitted, and "180° and also mirrored" cancels on that axis instead of
  depending on the order a camera stack applies two flags in. CSI does it in the sensor
  and it is free; V4L2 gets an ffmpeg `-vf` filter written without spaces, because go2rtc
  splits an `exec:` line on whitespace. 90°/270° are deliberately absent: the sensor
  cannot do them and faking them would put a transcode back into the pipeline.
- **Switching camera module cleans up after the previous one.** A tuning file is a
  *sensor* calibration, so leaving an Arducam IMX519's on a Raspberry Pi OV5647 hands the
  new sensor another one's colour and exposure model — silently, with a picture that still
  looks plausible. `reconcileCameras` now runs on every module selection: it fills in the
  new module's tuning file, drops the previous module's, and clears a focus mode the new
  module has no actuator for. Only catalogue values are touched — a hand-entered path is
  the operator's and stays — and USB cameras are never touched.
- **The go2rtc reload log no longer lies.** go2rtc restarts *itself* on
  `POST /api/restart` and often drops the connection before answering, after which the
  gateway claimed the config had not been applied. It now asks which streams are actually
  being served before saying anything.
- **No camera is stated as a valid setup**, in the preview and in the startup banner,
  rather than reading like something is missing. The gateway's preview is a manual still
  frame, so it never had YonderRC's reconnect problem — nothing to fix there, only the
  wording.
- **Not verified on a gateway.** All of it was proven on the YonderRC vehicle — same Pi
  OS, same libcamera, same code — but no YonderGate box has run it.

## v0.13.0
- **The Pi camera path never worked on current Raspberry Pi OS** — ported from YonderRC
  v1.47.0–v1.49.1, where all of this was found and fixed on a real Pi 4B with an Arducam
  16 MP IMX519. YonderGate inherited the same three bugs at the fork.
- **Wrong binary.** The generated go2rtc source called `libcamera-vid`; Bookworm renamed
  the tools to `rpicam-*` and dropped the old symlinks, so go2rtc logged `executable file
  not found in $PATH` and the stream never produced a frame. `detectRpicamBinary()` now
  resolves the real name at startup, `rpicam-vid` first, `libcamera-vid` for Bullseye.
- **A shell pipe that could never work.** The source was `libcamera-vid … -o - | ffmpeg …
  -f rtsp {output}`, but go2rtc runs `exec:` **without a shell** (`shell.QuoteSplit` +
  `exec.Command`), so the `|` and everything after it went to the camera binary as literal
  arguments — fixing the name alone would have changed nothing. Without `{output}` go2rtc
  reads the process stdout and sniffs the format itself, and raw H.264 Annex-B is exactly
  what `rpicam-vid` writes, so ffmpeg is gone from the `rpicam` path entirely: one process
  less, no transcode, less latency.
- **Setup › Cameras › CSI camera module** — pick the sensor instead of editing config.txt
  over SSH. Only the four official Raspberry Pi cameras are auto-detected; Arducam IMX519 /
  64MP Hawkeye / OV64A40 Owlsight / Pivariety each need their own `dtoverlay`. Selecting a
  module writes `camera_auto_detect` and `dtoverlay=` into `/boot/firmware/config.txt` and
  the panel says *Reboot required* until the box has booted with it, with a **Reboot now**
  button next to it. Nothing is rewritten blind: one backup as `config.txt.yondergate-bak`,
  competing lines commented out rather than deleted, our block marked and replaced whole,
  appended under its own `[all]`. A custom overlay name must pass a syntax check *and*
  exist as a `.dtbo` on that Pi.
- **Focus control** — `CameraCfg` gained `focus` (`off`/`manual`/`auto`/`continuous`),
  `lensPosition` in dioptres and `tuningFile`. Raspberry Pi's stock `imx519.json` has no
  `rpi.af` algorithm, so libcamera refuses every focus control and an Arducam 16 MP stays
  permanently soft; `provisioning/tuning/imx519-af.json` adds it, with a **measured** map
  (`[0.0, 597, 10.0, 1023]` — the actuator's rest position is not infinity).
  `install.sh` puts it in `/var/lib/yondergate/tuning/`, and selecting the module fills the
  path into the `rpicam` cameras that have none.
- **`Detect hardware` tells the truth about cameras now.** It ran the same hardcoded
  `libcamera-hello` and, finding nothing, listed every `/dev/video*` — on a Pi with no
  camera at all that is `video10`…`video31`, the V4L2 codec/ISP nodes. It now tries
  `rpicam-hello` first, counts only real capture nodes, and explains the boot config
  instead of always advising a `dtoverlay`.
- Reboot detection compares the effective configuration against what the system actually
  booted with, keyed by the kernel boot id, so switching away and back is silent.
  `SimSystem` keeps its own config.txt, so the whole panel works on a laptop.
- **Not verified on a gateway.** All of it was proven on the YonderRC vehicle — same Pi
  OS, same libcamera, same code — but no YonderGate box has run it.

## v0.12.12
- **`README.de.md`** — the German README, in full rather than a summary: every section,
  every TODO item, the tariff table and the two running budgets. Both files now carry the
  language switcher at the top, the same way YonderRC does, and the German one links the
  German docs (`HARDWARE.de.md`, `DATA-BUDGET.de.md`) rather than sending the reader back
  to English.
- **A test fails if the two drift apart.** Same sections, same number of TODO items, same
  ones ticked, and each pointing at the other. It cannot judge a translation, but it
  catches the thing that actually happens: a bullet added to one of them and forgotten in
  the other. Verified by breaking it on purpose before committing.
- **CLAUDE.md says the rule out loud**: both language versions are edited in the *same
  commit*, always. A translation that lags is worse than none — it states as current
  something the project stopped doing, and the reader has no way to tell which of the two
  is the lie.
- The same guard and the same wording went into **YonderRC** (v1.46.3), whose two READMEs
  already matched.

## v0.12.11
- **The 80 % warning now works for prepaid credit billed per megabyte, not just a monthly
  allowance.** Setup › Mobile data has both shapes: *a monthly allowance* as before, or
  *prepaid credit* — you enter what you last loaded onto the card and what a megabyte
  costs (3–5 ct on a German prepaid tariff), and the same warning fires at 80 % of the
  balance instead of 80 % of a bucket.
- **A card billed per MB has no month, so the counter does not have one either.** It runs
  from the **last top-up**, not from the 1st, with an *I topped it up* button that starts
  it again. The monthly figure keeps running alongside for anyone who still wants it.
- **It says how long the credit lasts** — "about 40 more days at 0.60 €/month" — computed
  from what was actually spent since the top-up. Under a day of history it refuses to
  project rather than dress a guess up as a number. On most German prepaid tariffs the
  top-up is also what stops the SIM being deactivated for inactivity, so that line doubles
  as the reminder for the next one.
- **Fixed while doing it: the monthly counter dropped one poll interval at every month
  boundary.** The reading that crossed midnight on the 1st used to be thrown away and
  taken as a new baseline. Invisible at a minute's resolution — but the credit total has
  no month, and would have lost that chunk every month for years. The reading now carries
  across; the test that encoded the old behaviour was updated rather than worked around.
- An existing `usage.json` from before this release loads unchanged; both new fields are
  optional and default to zero.
- **The README now says what this thing costs to run**, both budgets, with the measured
  figures: watts (≈2.5–4 W, and why the board is only the third biggest lever) and
  megabytes, plus a tariff table for private customers — per-MB prepaid at 25 ct–1 € a
  month against our own standby, an auto-renewing pack that doubles as the top-up, a
  monthly data tariff at ~2.99 €, and the pay-per-use IoT SIM at ten times the price. With
  the trap named: most providers count a top-up, not usage.

## v0.12.10
- **Prepaid: pack or per megabyte?** The data-budget doc now answers it with our own
  measurements instead of hand-waving. Per MB in an ordinary German tariff is **3–5 ct**
  (congstar ~5 ct, CallYa ~3 ct) — four to seven times cheaper than the pay-per-use IoT
  SIMs. Against the measured standby of 5–20 MB a month that is **25 ct to 1 € a month**;
  the watchdog at five minutes is ~15 ct, an hour with the page open ~10 ct.
- **The break-even is ~60–130 MB a month**, which is exactly where looking at cameras stops
  being rare. Two things decide it beyond the arithmetic: an **auto-renewing pack is also
  the top-up**, so it keeps the SIM alive by itself and there is no yearly ritual to forget;
  and **per MB has no ceiling except the credit** — a forgotten camera stream or a retry
  loop bills straight through, which on prepaid caps the damage but leaves the box offline
  until somebody notices.
- **The cheapest small data tariffs, with numbers** (August 2026, and they move): ~2.99 €
  for 3 GB monthly-cancellable in the o2 network is the cheapest on the market; ~2 € gets
  you congstar prepaid data in the **Telekom network**, dearer per GB and better where
  reach actually matters. Small packs are a trap — 3 GB usually costs less than 1 GB.
- **And the one that looks like the answer and is not:** GMX FreePhone advertises 3 GB for
  **0 €** and is **eSIM only**, which a HiLink stick cannot take. The price also holds only
  while you open their mail app ten days a month, is guaranteed for a year, and carries an
  auto-top-up. Written down so it gets rejected once rather than re-suggested forever.
- The recommendation is now two-stage: **start per MB, let the built-in counter tell you
  when you cross ~100 MB**, then switch to the smallest auto-renewing pack — which from
  that point is both cheaper and the thing that stops the SIM being deactivated.

## v0.12.9
- **The SMS wake is decided against, and the reason is written down** rather than left as
  a TODO somebody re-proposes in three months. It failed on the tariff, not the code: the
  wake channel is only as reliable as the SIM's ability to receive an SMS, and the products
  a private customer can actually buy do not dependably come with a usable number — data-only
  M2M tariffs frequently have no MSISDN at all. A way in that works until the day you need
  it is worse than not having one.
- **The tariff advice was wrong and is corrected.** It recommended an "IoT lifetime bundle
  with SMS" — 1NCE and o2's *Easy IoT* are exactly the right shape for this box and **both
  are business-customer products**. Recommending something the reader cannot buy is worse
  than recommending nothing.
- **What a private customer actually has**, now in the doc with figures: a pay-per-use IoT
  SIM that keeps the shape but bills small users at the worst rate (~20 ct/MB once the
  under-5 MB surcharge applies), ordinary prepaid chosen for its inactivity rule, or a small
  monthly data tariff with no rule to track at all.
- **The inactivity rules are tabulated, and the trap is named.** They run from 90 days
  (Vodafone CallYa — unusable for a box meant to be quiet) to 24 months (Telekom). And the
  catch is not the one you would guess: **most providers count a top-up, not usage**, so a
  gateway quietly spending 5 MB a month can still be switched off for inactivity.
- The recommendation is now **coverage first**: at a remote plot the network that reaches
  the box decides more than the price, and a stick that has to transmit hard also burns
  watts. Then a prepaid SIM on the Telekom network, with the top-up date in a calendar.

## v0.12.8
- **The two button rows in the uplink panel were touching.** *Open now* and *Save mode* sat
  flush against each other with no air, which read as one control. Both rows now carry the
  same spacing the rest of the page uses.
- **"Back to the schedule" said nothing about what it does, and most of the time it did
  nothing at all.** It only ever cancelled a hand-opening, so with no override running it
  was a button that answered a press with silence. It is now hidden until there *is*
  something to cancel, and then labelled with what it ends: *"Cancel — close again instead
  of at 12:14"*.
- The paragraph above the buttons now says what *Open now* is for in the first place: it
  brings the tunnel up outside the window for half an hour, for when you need in today and
  the window is on Sunday.

## v0.12.7
- **WireGuard can now be set up by hand, not only from a file.** Uploading the `.conf`
  is perfect when there is one — a FritzBox hands you a file. It is useless when there is
  not: a peer somebody set up for you, a provider that shows the values on a web page, a
  key you generated on the Pi. Then you had seven pieces of information and nowhere to
  type them. Setup › Remote access › WireGuard now offers both, on a radio button.
- **One stored representation either way.** The fields are turned into the `.conf` and
  that stays the source of truth — `wg-quick` reads a file regardless, and keeping a
  second parallel copy in the config would be a drift bug waiting for the day the two
  disagree. The form is filled by parsing the stored file back, which has the pleasant
  side effect that **a `.conf` you uploaded can afterwards be edited field by field**.
- **What the form cannot hold, it says so about** rather than dropping quietly: a second
  `[Peer]`, or directives like `MTU` and `PostUp`. The panel names them and tells you to
  stay on the file if you need them.
- **The two secrets never come back out of the box.** `/api/remote` answers without the
  API secret so the page always loads, and this box's onboarding hotspot is open by
  default — returning the private key there would hand anyone in Wi-Fi range the VPN.
  The form shows them as stored and leaves the boxes blank; blank means keep.
- **Every refusal names the fix**, because this is read on a phone: a missing private key
  says `wg genkey`, a bad endpoint says what host:port looks like, a stray preshared key
  says `wg genpsk`. A bare address like `10.0.0.2` is accepted and written as `/32`, since
  that is what people are told to type.
- **Keepalive defaults to 25 on purpose.** Behind carrier NAT a tunnel without it works
  until the first idle minute and then quietly stops carrying anything inbound.
- Identical in **YonderRC** (v1.46.2): same module, same endpoint, same panel — the two
  repositories differ only in the word they use for the box.
- 626 tests (33 new): key and endpoint shapes, the round trip through a conf and back, a
  foreign file with lower-case keys and comments, and the redaction.

## v0.12.6
- **Two modes for the tunnel, on a radio button** (Setup › Remote access). **Always live**
  is what the box has always done. **Only in a window** keeps it down and holds the alerts,
  then opens everything at once: default **Sundays 14:00–14:15**, with day, start, length
  and the post-restart grace all settable.
- **The alerts are held on disk, not in RAM.** A window can be a week away and the box may
  well reboot in between — an alert that only ever lived in memory would be exactly the one
  you never hear about. They go to `/var/lib/yondergate/alert-buffer.json`, survive a
  restart, and a flush that fails keeps them for the next attempt rather than dropping the
  only message of the week.
- **They arrive as one message, not forty.** A sensor that flapped for six days would
  otherwise empty itself into your phone the second the window opens. Grouped by what went
  wrong, with the count and the span: *"Voltage low — 12× between Mon 03:14 and Sat 21:00"*.
  One urgent thing makes the whole digest urgent.
- **It cannot be the reason nobody can reach the box.** That is the failure this feature
  could obviously cause, so there are four ways out: the tunnel stays up for ten minutes
  after **every restart** (you rebooted it — that is exactly when you want in), it is never
  taken down while somebody has the page open, *Open now for 30 min* overrides the schedule,
  and a failed bring-up is retried on the next tick instead of being swallowed.
- **A captive-portal probe does not count as "somebody is here".** Every request to this
  port used to; a phone on the hotspot checking for internet would then have held the tunnel
  open around the clock and quietly undone the whole mode — the worst way for it to fail,
  because the box looks configured and only the bill disagrees. Presence is now the setup
  page's own polling, which already stops when the tab is hidden.
- **It works for whichever VPN you picked** — the window drives `remoteUp`/`remoteDown`, not
  Tailscale directly, so ZeroTier and WireGuard get the same behaviour. The watchdog also
  learned to skip its `tailscale up` rung while the window is shut, instead of fighting the
  mode every time a probe fails.
- 593 tests (46 new): the schedule including a window that runs past midnight, every refusal
  to strand the operator, the buffer surviving a simulated reboot, the digest grouping, and
  the service actually calling down/up/flush in that order.

## v0.12.5
- **A data budget, because the SIM is the other thing this box runs on.** The requirement
  is modest — a message when something is wrong, plus the odd look at a camera or the
  battery — and it deserves an honest answer:
  [docs/DATA-BUDGET.md](docs/DATA-BUDGET.md) measures where the bytes go and works through
  which kind of tariff survives a box that is deliberately silent.
- **It starts with the part that cannot be tuned away**: "reachable instantly" and "uses
  no data while idle" are in tension, because a permanent tunnel is a permanent
  conversation. Three shapes are laid out — Tailscale always up (what ships), **alerts
  only with an SMS wake** (near-zero standby; SMS costs no data at all), and scheduled
  windows as the fallback that keeps the SMS path from being able to strand you.
- **Two measured wins, both shipped here.** The setup page went from **121.9 kB to
  33.1 kB** on the wire (gzip) and an unchanged page now answers **304 with no body** at
  all. Bodies under 512 bytes are left alone, where gzip is only noise, and the validator
  is over the content — a `git pull` that restores an identical page must not cost 120 kB.
- **The page stops polling when nobody is looking at it.** It polls system every 3 s,
  sensors every 5 s, health every 30 s: about **2 MB an hour**, so a tab forgotten
  overnight was ~17 MB — on an IoT SIM sold with 500 MB for its whole life, a real bite.
  Hiding the tab stops every poll; coming back refreshes at once, so nothing is quietly
  stale.
- **The watchdog now says what it costs**, next to the field where you set it: two pings
  every five minutes is ~3 MB a month, more than the alerting this box exists for, and the
  line suggests 15–30 min when the number gets big. A decision instead of a surprise.
- **`apt` is named as the item nobody budgets for** — daily package lists on a metered link
  can dwarf everything the gateway does. It is a real trade-off against security updates,
  so the installer still leaves it alone and the doc gives you the two commands.
- **The sensors are generic again.** Voltage, current and temperature are readings, not a
  solar feature: an off-grid battery is one thing to point them at, but the page must read
  just as well on a bench supply. CLAUDE.md and docs/CONCEPT.md say so now, so the next
  pass at that page does not build a solar dashboard.

## v0.12.4
- **The installer now gives a small board swap before the step that needs it.** A Zero 2 W
  runs the service comfortably — it measures ~54 MB — but `npm install` during an *update*
  is a different load, and a gateway that runs out of memory mid-update is one somebody has
  to drive to. On any board under 1.5 GB, `install.sh` enables **zram**: zstd, 60 % of RAM,
  priority 100.
- **In RAM, deliberately, not a swapfile on the card.** This box lives on solar; the power
  can vanish mid-write, and the SD card is the thing that dies. Pi OS's own dphys-swapfile
  is left as it is — zram simply registers at a higher priority, so the kernel reaches for
  RAM before it reaches for the card.
- **It knows when to stay out of the way**: a Pi 4 or 5 is skipped with a line saying so,
  an existing zram setup is left alone, an unreadable `/proc/meminfo` skips rather than
  aborting provisioning, and a failed `apt-get` prints the cause and the fix instead of
  killing the install — the update path is the last thing that may become fragile.
- **Re-running the installer does not stack config**: the settings go into
  `/etc/default/zramswap` between markers that the next run replaces.
- Tests hold the two properties that actually matter (518 now): zram is set up **before**
  the `npm install` it protects, and it is gated on a memory check rather than forced onto
  every board. Docs updated — `docs/HARDWARE.md` and its German sibling described this as a
  manual step and a gap; it is neither any more.

## v0.12.3
- **A hardware guide, because the first question about an off-grid box is "what do I buy
  and what does it cost me in watts?"** [docs/HARDWARE.md](docs/HARDWARE.md) answers both:
  a **Pi Zero 2 W** (the original Zero W is ARMv6 — no 64-bit OS, no Node, it will never
  run this), a HiLink stick with a real external antenna, **IP cameras rather than USB**,
  and an INA228 in the battery line.
- **The power budget it is designed against: ~2.5–4 W, i.e. 60–95 Wh/day.** With the part
  most people get wrong spelled out — the board is the *third* biggest lever. One
  always-on IP camera can cost more than the entire gateway, and a stick with a poor
  antenna transmits harder and burns watts doing it.
- **What the Zero 2 W actually costs you**, all four of them checked against this
  repository: 512 MB where the risky moment is `npm install` and not runtime (the service
  measures ~54 MB RSS), one 2.4 GHz radio that cannot do AP and uplink at once, one
  micro-USB data socket, no Ethernet.
- **Why an RTSP camera is free and a USB one is not** — the RTSP path is `-c copy`
  (`cameraManager.ts:107`), a USB camera is transcoded (`cameraManager.ts:112`). That is
  also why the Pi 5, with no H.264 encoder, is the wrong board here.
- **Brownout and the SD card**, the way off-grid Pis actually die: a 5 V buck with
  head-room, the LTE stick's spikes kept off the Pi's rail, the charge controller's
  low-voltage disconnect doing the cutting, and the `vcgencmd get_throttled` bit 16 the
  gateway already reads (`health.ts:82`) — under-voltage *since boot* is the one that
  catches a supply that sagged at 3 a.m. Whether a card survives a season of it is not
  something this repo can claim, and the guide says so.
- German sibling `docs/HARDWARE.de.md`, and the installer note now points at both. The
  guide also names a gap it does not fix: `install.sh` sets up no zram or swap, which a
  512 MB board wants before its first update.

## v0.12.2
- **You can now enter the secret, not just set one.** After generating one there was
  nowhere obvious to type it again — the page only asked via a browser `prompt()`, in the
  middle of whatever you had just pressed. Setup › Security now has an **Unlock this tab**
  field that appears exactly when it is useful: a secret is set and this tab does not know
  it. A refused save points at that field instead of popping a dialog.
- The field is checked against the gateway (`POST /api/auth/check`, behind the same gate
  as every other write, so a wrong secret is refused by the real rule rather than by a
  second copy of it) — you find out immediately, not at the next save.
- The status line says which of the two states you are in: *no secret*, *set · this tab is
  unlocked*, or *set · this tab cannot change anything yet*.
- Worth being clear about what it is for here, since this project has no ground app: it is
  **not** needed to connect. Reading — the whole page, the sensors, the history — is always
  open. The secret gates **changes**, and the device proxy.

## v0.12.1
- **The API secret was in the setup page but nobody could find it.** It sits ten panels
  down, and nothing anywhere else mentioned whether the box had one. The **System status**
  block at the top now says so in one line — "API secret set", or a warning that links
  straight to the panel — because a lock nobody can see is a lock nobody sets, and this
  box sits unattended at a site for a year with relays behind it.
- The Security panel explains what it is actually for now (an open hotspot, a marina or
  campsite WiFi, a shared LAN — not a Tailscale-only box) and, just as importantly, what
  protects you *without* it: a page from the internet is refused whatever you do. Its old
  text still described the RC project's ground app, which does not exist here.

## v0.12.0
The security fix from YonderRC's review, which applies here with sharper teeth: this box
switches relays.

- **A page from the internet can no longer act on the gateway.** The API secret is off by
  default, so any site the operator happened to open — on a phone joined to the gateway's
  own hotspot, which is open by default — could POST to the setup API (reboot, WiFi,
  factory reset) or push a request through the **device proxy** to whatever the devices
  behind it accept. A relay is switched by a plain URL, which is the sharp end: the page
  never needs to read the answer, making the browser fetch it *is* the attack, and an
  `<img>` tag does that without sending an `Origin` header at all.
- So the gateway judges a request by **what caused it**: `Sec-Fetch-Site: cross-site` —
  sent by current browsers on every request, including `<img>`, `<script>` and forms — is
  refused outright. Otherwise the `Origin` decides: none at all (curl, scripts, the
  tests), `file://`, a private, loopback, `.local` or Tailscale address, or the gateway's
  own address are accepted; the public internet is refused with **HTTP 403** unless it
  presents the API secret. Reads are untouched, so the setup page always opens.
- This also defeats DNS rebinding: the attacking page keeps its own origin even once its
  name resolves to 192.168.4.1.

## v0.11.0
A full review pass over the code and the concept, prompted by one question: *do devices
on the hotspot actually get internet when the LTE stick has it?* They do — the hotspot
is a NATed shared connection — but checking that turned up the reason they often would
not, and four more things worth fixing.

- **Fixed: the captive portal was decided once and never revisited.** In AP mode the Pi
  resolves every name to itself so a joining phone lands on the setup page. That choice
  was made when the hotspot started — which at a fresh site is the worst moment: the box
  boots with no LTE, the portal goes up, the stick registers a minute later, and from
  then on every device on the hotspot is NATed to a working uplink while DNS still points
  at the setup page. Internet that looks broken, until somebody drives out and restarts
  the hotspot. It is now re-decided every minute against the uplink of the moment.
- **Fixed: the ntfy topic was readable by anyone on the LAN or the open hotspot.** The
  status endpoint needs no secret, and it returned the topic URL in full. ntfy has no
  accounts on the public server, so the topic *is* the credential — the setup page even
  says to pick something unguessable. It is now shortened to `https://ntfy.sh/yg…4f2`,
  like the token, and typing over the shortened value is what changes it.
- **Fixed: the data counter wrote to the SD card every minute.** Recording sensor history
  is opt-in precisely to spare the card, and then the usage counter rewrote a file
  525 600 times a year anyway. It now reaches the card every quarter hour and on a clean
  shutdown; the total in memory stays exact.
- **Fixed: a sensor plugged in mid-month was silently not recorded.** A CSV has one
  header, so a channel with no column had nowhere to go and was dropped until the month
  rolled over — exactly when somebody is watching the page to see whether the sensor they
  just wired up works. The month now continues in a part file, and both are read back as
  one series.
- **A device scan can no longer hang on reverse DNS.** With no reachable DNS server each
  lookup sat out the resolver's full retry budget; 128 addresses of that turned a
  ten-second scan into a minute of apparently-frozen page. A name is now worth 1.5
  seconds, not more.
- **The update check is cached for ten minutes** (the Check button still forces a fresh
  one). It runs `git fetch`, it needs no secret, and on a metered SIM a browser left open
  on the page should not spend the allowance.
- Documented what the hotspot does with an uplink, and that traffic from hotspot clients
  comes out of the SIM like any other.

## v0.10.0
- **Fixed: the watchdog could have rebooted the box forever.** The failure counter lived
  in memory, so a reboot reset it — medium gone (a dead SIM, an unplugged stick, a router
  that is off) → eight failed probes → reboot → counter back to zero → forty minutes
  later, reboot again, and again, indefinitely. Nothing gets fixed, the card wears out,
  and anyone standing at the site watches the box die under them every forty minutes.
  Caught by the owner asking whether that could happen, before it ever ran on hardware.
- **The reboot budget is now written to disk** — the one piece of state a reboot must not
  clear. **At most two reboots a day, six hours apart.** The cheaper steps keep running:
  Tailscale and the network stack are still restarted on every escalation. Only the big
  hammer is rationed, and when the budget is spent the box says the useful thing —
  *"already rebooted 2× today and it did not help — the medium is probably gone, and
  another reboot will not conjure it back"*.
- **A reboot is skipped while somebody has the page open.** The uplink being down does
  not break local access: the hotspot, the LAN and the page all still work. Rebooting
  then would kick out the person who is standing there trying to fix it — including the
  weekly maintenance reboot.
- The panel now shows the limits rather than just the switch: failed probes, reboots
  today, and what the budget currently allows.

## v0.9.1
- **Fixed within minutes of shipping it: an impossible GPIO pin was accepted.** The
  router clamped the number into range before validating it, so pin 99 became pin 27 and
  the switch was saved — a relay quietly wired to a line nobody chose. Pin, channel and
  off-time are now checked, not corrected. "Helpfully" fixing a value the operator typed
  is how a switch ends up controlling the wrong thing.

## v0.9.0
- **Power switches.** A Shelly, a Tasmota plug, any pair of URLs, or a relay on the Pi's
  GPIO — on, off, or a proper power cycle from the page. This is the only thing in the
  box that can *act* on a fault instead of describing it: the camera that has stopped
  answering and would come back after a power cut is otherwise a two-hundred-kilometre
  drive.
- **And it can do it by itself.** Link a switch to a saved device and the gateway
  power-cycles that device when it stops answering — **once**, then an hour of quiet. A
  relay that clacks all night on a flapping link is worse than a device that is simply
  down, because it is also unrecoverable by hand.
- A cycle is *scheduled*, not awaited: the answer has to reach the browser before the
  thing the browser is talking through possibly loses power. And GPIO relays that switch
  on a LOW level are a checkbox, because getting that backwards is discovered from far
  away.
- **Hardware watchdog.** Everything else assumes this service is still running; if the
  kernel wedges, nothing in user space gets a turn and the box is gone until someone
  drives there. The Pi has a timer chip for exactly that — systemd pets it, and if it
  stops, the board resets. Off by default, because a machine that resets itself is not
  what everyone wants on a bench, and switched on from the page (`daemon-reexec`, not
  `daemon-reload` — the latter would leave the setting looking applied while doing
  nothing).
- `gpiod` is installed by the provisioner, so a relay works out of the box.
- **The Wi-Fi uplink case is documented.** Not every site is an LTE site: the README now
  spells out the three shapes (LTE stick, Wi-Fi client, Ethernet) and the one rule that
  actually bites — a Pi's built-in radio can *join* a network or *serve* a hotspot, never
  both, so a Wi-Fi uplink means the devices join that same Wi-Fi, or you add a second USB
  adapter for the hotspot.

## v0.8.0
- **Alert rules are made on the page now.** Pick a sensor reading (the list comes from
  the channels this site actually has), a saved device, or the box itself; set a limit
  and how long it has to hold. A sensor rule without a limit is refused rather than
  silently watching nothing.
- **There is a watchdog, and it was worth asking about.** Until now the only protection
  was `Restart=always`, which catches a process that *crashed* — and none of the failures
  that actually happen at a remote site: an LTE session that is up but carries nothing,
  a modem that answers but stopped routing, Tailscale logged out after a token expired.
  From the inside all of those look healthy. So the gateway probes whether traffic still
  reaches the outside and escalates **cheapest-first**: bring Tailscale up (2 failed
  probes), restart the network stack, which redials LTE (4), reboot (8, and only if
  allowed). Each step fires **once** at its threshold — repeating "restart the network"
  every five minutes helps nothing and hides whether the last attempt did anything.
- The probe target is an **address**, not a hostname: a broken DNS would otherwise read
  as a dead link and trigger a reboot that fixes nothing.
- **A weekly reboot, on by default (Sunday 04:00) — and yes, it is a good idea.** It is a
  crutch, and a cheap one: it clears leaked memory, wedged USB modems and drivers that
  quietly stopped, none of which anyone is there to notice. The guard that matters is the
  uptime check — without it a box that boots inside its own window reboots again, and a
  site you cannot reach is now in a loop.
- Every recovery step is announced **before** it runs, best-effort: the missing link is
  exactly why the message may not arrive, and that must never stop the recovery.
- Cameras moved above the sensors and both panels are collapsed — the page is read from
  the top, and those two are set once.

## v0.7.0
- **Fixed a layout bug with one cause and four symptoms.** `input { width: 100% }` — the
  rule that makes text fields fill their column — also applied to checkboxes, so each one
  stretched across the row and shoved its own label to the far edge. "Send alerts",
  "Record history", "Allow data roaming" and the coulomb-counting toggle all looked
  broken for the same reason; the subnet-route rows now line up as well.
- Headings had no space before the controls belonging to them, which is why *Site
  network* sat directly on its buttons.
- **The Sensors panel moved to the top and is collapsed**, since it is the thing you
  glance at and the rest is what you configure once.
- **Time is now answerable from the page**: the box's own clock and timezone are shown
  (so you can check them against your watch), the **servers actually in use** appear in
  the field instead of an empty box that looks unconfigured, and the timezone is
  settable. Synchronisation is on by default — that is systemd-timesyncd with the
  distribution's servers.
- **The DS3231 is a checkbox now.** Plug the clock onto the I²C pins, tick the box,
  reboot: the gateway writes `dtoverlay=i2c-rtc,ds3231` into `config.txt` itself. The
  edit is idempotent in both directions and touches nothing else, because that file also
  decides whether the Pi boots at all. What it buys: the site keeps time through a power
  cut on the clock's own battery, the kernel reads it at boot, and NTP corrects both once
  the network is back.
- **The interface for the data counter is a list, not a guess.** It is populated from the
  box, with each interface's addresses next to it — nobody should have to know their WiFi
  is called `wlp59s0`.
- **The allowance now reads as a plan**: used, left, days to go and what that leaves per
  day. A percentage alone does not tell you whether to keep a camera streaming.

## v0.6.0
- **Recording is now off by default.** It is the only thing here that writes to the card
  continuously, and an installation that wants maximum endurance should not have to
  discover that it opted in by accident. One checkbox in Setup › Sensors turns it on;
  retention and the write interval are settings rather than assumptions.
- **The gateway speaks up.** Alerts over **ntfy**: a sensor past a threshold, a saved
  device gone quiet, the supply sagging, the data allowance at 80 %. Each rule has to
  hold for a while before it counts and then stays quiet for six hours — the lesson from
  the sibling project, where a link that flapped every minute taught us what a voice that
  cries wolf is worth. Recovery is only announced for a problem that was announced.
- **A sensor nobody wired up is not an alarm.** This box is meant to run with whatever
  the operator happened to connect, so a missing reading is silence, never a breach.
- **Site health**: disk, CPU temperature, load, uptime, **undervoltage now and since
  boot** (the classic Pi-plus-LTE-stick failure that quietly eats SD cards), whether the
  **clock is synced**, and whether a hardware clock is fitted. Every one of them is
  `null` when it cannot be read — a box without `vcgencmd` is a normal box, and "unknown"
  must never render as a healthy zero.
- **Time is configurable from the page**: NTP servers are validated, written as a
  systemd-timesyncd drop-in and applied. A **DS3231 RTC** is detected when present and
  documented for sites that are offline for long stretches — deliberately not enabled by
  default.
- **Mobile data counter with an allowance.** Either the stick's own figure (what the
  carrier sees) or the kernel's interface counters (works for any uplink); the gateway
  keeps its own monthly total from the **differences**, so a stick reboot or a Pi reboot
  costs nothing. A counter that went backwards means "something restarted", not "we
  un-sent 4 GB" — and a warning goes out at 80 % of the cap.

## v0.5.0
- **The sensors have a memory.** One averaged value per minute is recorded and kept for
  13 months, with hour / day / week / month / year views drawn in the page itself — no
  charting library, because a site with a flaky uplink cannot fetch one. The band behind
  each line is the **minimum and maximum** inside every averaged step: on a battery the
  dip under load is precisely what a mean hides.
- **The sizing decided the design.** A minute row with a handful of channels is ~40
  bytes, so a year is about **21 MB — 0.13 % of a 16 GB card**. That removes the usual
  reason for tiers of ever-coarser data: full minute resolution is kept for the whole
  window and longer views are averaged **when you ask**, so nothing is lost to a
  downsampling pass that already ran.
- Written as plain CSV, one file per month. A half-written line after a power cut costs
  one minute, not the file, and a year of measurements can still be read with `tail` over
  SSH. Recording never takes the gateway down: a full card costs history, not the page
  that would tell you about it.
- Samples are buffered and flushed every five minutes — a few hundred SD-card writes a
  day instead of tens of thousands. The trade is stated plainly: a power cut loses up to
  five minutes.
- Found while running it: for the first few minutes of a fresh box the API returned data
  points with **no channel names**, because names were only read from files that did not
  exist yet — the page had numbers and nothing to draw them under.

## v0.4.0
- **A scan is no longer anonymous.** Devices can be given a name and the port their web
  UI actually listens on, and both survive the next scan. Saved devices are keyed by
  **MAC**, not address: DHCP moves addresses around, and a camera that comes back on a
  different one is still the camera you named.
- **A saved device that stops answering stays in the list**, marked *not answering*,
  with the time it was last seen. That is the whole reason to save one: on a site you
  cannot walk to, "the camera I named is silent" is the most useful thing this page can
  tell you — dropping it from the list would hide exactly that.
- Publishing now uses the device's **configured port**, so a UI on 8080 or 8443 works
  like one on 80, and the published entry carries the name you gave it.
- **README explains the whole idea from scratch**: why a `192.168.x.x` address at a
  remote site is unreachable, why port forwarding does not help behind CGNAT, what
  Tailscale does about it — and then both ways through, step by step: subnet routes
  (reaches everything, needs one approval in the admin console, `--accept-routes` on
  Linux clients) and publishing a single device (no routing changes, survives an address
  collision with your home network). Including when to pick which.

## v0.3.0
- **The RC wording is gone.** This box sits on a yacht, an allotment or a remote plot —
  it does not steer anything, and calling it "the vehicle" in 130 places was inherited
  clutter that would have shaped how the thing gets built. Comments, UI copy and docs now
  say gateway, site and operator.
- **You can see the cameras.** The camera panel shows a **still frame** per camera (proof
  it works) and an **Open stream ↗** link to go2rtc's own player. The gateway generates
  go2rtc's configuration but deliberately does not serve video itself — the page says so,
  including which address it is pointing at when no frame arrives.
- **`npm run dev:video` simulates the whole video path locally**: it fetches go2rtc once,
  runs it against the config the gateway just wrote, and the default camera is an ffmpeg
  test pattern — so the preview, the player and the WebRTC path can be tried without a
  camera, a Pi, or a site.
- **The generated go2rtc config left the checkout** — before it could repeat the mistake
  it caused in YonderRC. In development it lands in `.runtime/` (git-ignored), on a real
  box systemd points it at `/var/lib/yondergate/`. A file the service rewrites at every
  start must never live in the repository, or `git pull --ff-only` stops working.

## v0.2.1
- **Fixed while running it for the first time: the VPN was offered as a network to
  advertise.** A laptop's `tailscale0` carries a `/32`, and it turned up in the list of
  subnets the gateway could route — advertising the tailnet's own address back into the
  tailnet is a loop, not a route. `tailscale*`, `wg*` and `zt*` interfaces are skipped
  now, and a `/32` is never offered as a network.

## v0.2.0
- **The gateway can now see the site.** *Scan* reads the kernel's neighbour table —
  instant, and it already knows everything that has spoken recently — while *Scan +
  sweep* pings every address in the subnet for the quiet ones. The list shows address,
  MAC, vendor, reverse-DNS name, which of a handful of ports answered, and a one-line
  guess at what the thing is. A guess is phrased as one: an RTSP port is a strong hint
  at a camera, not proof.
- **Two ways through to those devices, and they are not equivalent.**
  **Tailscale subnet routes** are the native answer: advertise `192.168.4.0/24` and
  every device is reachable at its real address from anywhere on your tailnet, no
  per-device setup. The gateway enables IP forwarding for it (as a sysctl drop-in, so
  it survives a reboot) and says the part everyone forgets — **the route must be
  approved once in the tailnet admin console**, and until then it exists and carries
  nothing.
  **Publishing a single device** on a gateway port is the fallback when routing is not
  an option: one button on the device list, and its web UI answers on
  `http://<gateway>:8100/`, guarded by the API secret like everything else.
- Safeguards that come from having built this before: a sweep wider than /22 is refused
  with a reason rather than silently truncated (a /16 is 65k pings, that is a nuisance,
  not a scan); `FAILED` neighbour entries are not devices (the kernel remembering that
  something did *not* answer is the opposite of a find); a publish port is never handed
  out twice, because the second one would take down the first — possibly this very page.
- 31 new tests cover the parsers, the subnet maths, the vendor lookup, route arguments
  and the port allocation. **None of it has run on a real site yet**: sweeps,
  `tailscale set` and `sysctl` are only provable on the Pi.

## v0.1.1
- The **WiFi country stays editable** after it has been set: the field used to appear
  only while the radio was broken, so correcting a wrong country needed SSH. It decides
  channels and transmit power — for a box that may be installed anywhere, that has to be
  a field on the page. No built-in default; the suggestion comes from the Pi's locale or
  timezone.

## v0.1.0
- Initial import, forked from YonderRC v1.45.2 for its setup UI and provisioning:
  AP onboarding with captive portal, WiFi country/rfkill repair, LTE incl. HiLink
  sticks and their proxied web UI, Tailscale/ZeroTier/WireGuard remote access, the
  self-update button, I²C sensors and go2rtc cameras.
- Everything RC-specific removed: control channels, PWM/SBUS drivers, arming and
  failsafe, the ground control app, stick bindings, OSD and GPS. The service now
  serves exactly one thing — the setup/status page — and carries no control socket.
- No build step any more: the gateway runs TypeScript directly, so an update is a
  pull and a restart.
