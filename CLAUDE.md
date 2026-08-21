# CLAUDE.md — YonderGate

Guidance for Claude (and humans) working in this repository.

## What this is
An **off-grid site gateway** on a Raspberry Pi: Tailscale access to a remote place,
its own WiFi AP for the devices there, discovery of those devices and a way through
to them, plus solar-relevant sensor readings and cameras. `docs/CONCEPT.md` is the
reference for the goal — read it before adding features.

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

## Style
German UI copy is fine in chat with the owner; **code, comments and identifiers
stay in English**. Docs are English-first with `.de.md` siblings.

## Next up
The list lives in **README.md → TODO** so it is visible to anyone who opens the repo;
keep it current when you finish something. The two that matter most right now:

1. **Nothing has run on a real site yet.** Discovery, subnet routes and forwarding are
   implemented and unit-tested, but sweeps, `tailscale set` and `sysctl` can only be
   proven on the Pi. Say so rather than implying they work.
2. **Sensor page for a solar site** — the numbers are the reason to open the page at
   all, and right now they are shown exactly as inherited from a model gateway.
