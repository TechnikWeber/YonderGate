# CLAUDE.md — YonderGate

Guidance for Claude (and humans) working in this repository.

## What this is
An **off-grid site gateway** on a Raspberry Pi: Tailscale access to a remote place,
its own WiFi AP for the devices there, discovery of those devices and a way through
to them, plus generic sensor readings (voltage, current, temperature) and cameras.
`docs/CONCEPT.md` is the reference for the goal — read it before adding features.

Owner: Philipp Weber · GitHub: TechnikWeber/YonderGate · **Forked from YonderRC**
(`git remote add yonderrc …` is configured, so fixes can be cherry-picked across
the unrelated histories).

## Monorepo layout (npm workspaces, TypeScript)
- `packages/protocol` — shared pure types (sensor readings, link signal). No deps.
- `packages/gateway` — the only service: `config`, `system/` (nmcli/mmcli/rfkill/
  tailscale/HiLink/update, each with a Sim and a Real implementation), `sensors/`,
  `video/` (go2rtc config generation), `transport/` (HTTP + setup API + device
  proxy) and `setup/setup.html` — the entire UI, plain HTML/JS, no build step.
- `provisioning/` — Pi installer, systemd units, AP onboarding.
- `test/suite.mts` — the whole suite (`npm test`).

## Commands
```bash
npm install
npm run dev     # service in sim mode → http://localhost:8080/setup
npm test        # must stay green
npx tsc --noEmit -p packages/gateway/tsconfig.json
```

## Conventions / gotchas (read before editing)
- **Sim-first**: every system call has a Sim implementation, so the whole UI works
  on a laptop. A failed real path degrades instead of crashing — a headless box
  must stay reachable to be fixed.
- **No build step, and keep it that way.** The service runs TypeScript directly and
  the UI is a static page read per request. That is what makes "pull and restart"
  a complete update over a weak LTE link.
- **Parse in the C locale.** `system/RealSystem.ts` forces `LC_ALL=C` for every
  command it parses: git, nmcli and friends translate their messages, and a German
  Pi answers `Schwerwiegend: …`, which no pattern matches.
- **Never identify a device by interface name.** The HiLink stick is found through
  `ip route get <host>` (`system/hilink.ts`); a LAN on another `eth*` must never be
  mistaken for it. The same rule applies to anything discovery adds.
- **Generated state lives outside the checkout** (`/var/lib/yondergate/`). Writing
  it into the repo left every running box with local modifications and blocked
  `git pull --ff-only` — that is what broke the update button in YonderRC.
- **Failure messages name the cause and the fix** (`hwDeps.explainNpmFailure`,
  `wifi.explainWifiFailure`, `update.explainGitFailure`). Raw tool output goes
  *underneath*, never instead. This is a box you reach from a phone, over LTE.
- **Pure functions carry the logic**, IO stays thin — that is why parsers,
  classifiers and step ordering are unit-tested without hardware.
- Hardware paths (I²C, nmcli, mmcli, rfkill) are **hardware-only-verifiable**. Say
  so instead of claiming they are proven.

## Conventions / gotchas — the site's network
- **The AP's subnet is a routing decision.** Tailscale subnet routes carry the site's
  *real* addresses to the tailnet, so an AP range that matches the network the operator
  connects from can never be reached. `AP_SUBNET_CHOICES` (wifi.ts) offers five, marking
  the familiar ones as risky *because* they are familiar; `hotspot.address` persists the
  choice and `onboard.sh` reads the same field. Never hardcode 192.168.4.1 again — it is
  a default, not a constant.
- **Internet is filtered by DESTINATION, not by uplink interface**
  (`system/passthrough.ts`). Naming the uplink would need re-applying on every LTE↔eth
  failover; naming the destination does not, and it is what keeps devices reachable from
  the tailnet with their internet switched off. REJECT, not DROP: a device that is told
  "no" gives up at once, one that is ignored looks broken for a minute.
- **Firewall rules do not survive a reboot** — `index.ts` re-applies them at every start.
  Anything else that writes iptables must do the same.
- **An AP with its internet switched off is an internet-less network**, so the captive
  portal belongs there too: the portal decision takes `apSharesInternet(cfg, hasUplink)`,
  not the uplink alone.

## Conventions / gotchas — the setup page
- **It is tabbed** (v0.16.0): every `<section class="panel">` declares a `data-tab`
  (overview / site / sensors / camera / network / remote / health / design) and
  `showTab` shows one group at a time, keyed off the URL hash. A new panel without a
  `data-tab` is invisible on every tab — the suite checks panels, buttons and the
  switcher's own list against each other. **Hidden panels stay in the DOM** (`hidden`,
  not removed): handlers read fields across groups.
- **Long explanations go in `<details class="hint">`** with the one-line takeaway as the
  `<summary>`, never in an always-open `<p class="msg">`. The tab strip **wraps**; only
  under 520px is it a single scrolling row, because a mouse wheel cannot scroll a
  horizontal box and the last tab was then unreachable on a PC.
- **`body` keeps `overflow-x: clip`, not `hidden`** — `hidden` makes it a scroll
  container and the sticky tab strip then has nothing to stick to.
- **The theme belongs to the gateway** (`config.theme`, 'light' default), not to the
  browser: this box is set up once and opened from whatever phone is to hand. Each
  browser caches the last answer only so a cold start does not flash the other palette.
- **I²C chips are identified, not guessed** (`system/detect.ts`, ported from YonderRC
  v1.60.0): `probesFor` + `identifyI2c` read the ID registers, RealSystem does the
  `i2ctransfer` reads, and the setup page marks a confirmed row with ✓ and offers "Use
  these addresses". An address alone cannot separate an INA2xx from an ADS1x15.
- **Nothing polls the site's network.** Discovery, the per-device *Check* and the
  last-seen timestamps all run because someone pressed something. This box is on a data
  budget and often on a battery; a background sweep is both.

## Style
German UI copy is fine in chat with the owner; **code, comments and identifiers
stay in English**. Docs are English-first with `.de.md` siblings.

**Both language versions are edited in the same commit — always.** `README.md` /
`README.de.md`, `docs/HARDWARE.md` / `.de.md`, `docs/DATA-BUDGET.md` / `.de.md`. A
translation that lags is worse than none: it states as current something the project
stopped doing, and the reader has no way to tell which of the two is the lie. The test
suite fails if the two READMEs stop matching in structure (heading count, TODO item
count), which catches the common case of adding a bullet to one of them.

## Conventions / gotchas — cameras
- **go2rtc runs `exec:` without a shell** (`shell.QuoteSplit` + `exec.Command`). A `|` in
  a camera source becomes a literal argument to the camera binary. Without `{output}`
  go2rtc reads the process stdout and sniffs the format instead, which is why the
  `rpicam` path is plain `rpicam-vid … -o -` with no ffmpeg. Never reintroduce a pipe.
- **The camera tools are `rpicam-*` on Bookworm**, not `libcamera-*`; the old symlinks are
  gone. `detectRpicamBinary()` resolves it at startup — don't hardcode either name.
- **A sensor outside the firmware's auto-detect set needs its own `dtoverlay`**, written by
  Setup › Cameras › CSI camera module (`system/bootConfig.ts`, pure + tested). config.txt
  decides whether the box boots at all: never rewrite it, only comment out competing lines
  and replace the one marked block.
- **A tuning file is a sensor calibration, not a preference.** Switching camera module
  runs `reconcileCameras` (`system/bootConfig.ts`): the new module's file goes in, the
  previous module's comes out, and a focus mode the new module has no actuator for is
  cleared. Only catalogue values are touched; a hand-entered path stays.
- **Orientation is one transform, not three options.** 180° *is* both mirrors, so
  `rotation`/`hflip`/`vflip` collapse to two booleans in `orientationOf()`. 90°/270° are
  not offered — the sensor cannot do them and faking them costs a transcode.
- **No camera at all is a supported setup**, not a fault. Say so in messages.
- **Raspberry Pi's `imx519.json` has no `rpi.af` algorithm**, so an Arducam 16MP is
  permanently soft; `provisioning/tuning/imx519-af.json` adds it with a measured map — the
  actuator's rest position is *not* infinity.

## Next up
The list lives in **README.md → TODO** so it is visible to anyone who opens the repo;
keep it current when you finish something. The two that matter most right now:

1. **Nothing has run on a real site yet.** Discovery, subnet routes and forwarding are
   implemented and unit-tested, but sweeps, `tailscale set` and `sysctl` can only be
   proven on the Pi. Say so rather than implying they work.
2. **Sensor page for a stationary box** — the numbers are the reason to open the page
   at all, and right now they are shown exactly as inherited from a model gateway:
   "x/x mAh remaining", "Reset mAh", a battery % built for a flight pack. Keep it
   **generic** — voltage, current, temperature, over time. An off-grid battery is one
   thing people will point it at, but the page must not be designed around that, or
   around solar; it should read just as well on a bench supply or a mains PSU.
