/**
 * When the tunnel is allowed to be up.
 *
 * A permanent tunnel is a permanent conversation: Tailscale holds a long-poll to its
 * control plane, keeps a relay connection alive and re-punches NAT often enough that
 * a carrier's CGNAT does not drop the mapping. None of that carries anything of
 * yours, and on a SIM bought for alerts rather than browsing it is the largest single
 * item in the budget (see docs/DATA-BUDGET.md).
 *
 * So there are two modes. **always** is what the box has always done. **window** puts
 * the tunnel — and the alerts — on a schedule: nothing goes out until the window
 * opens, then everything does at once and the box is fully live for as long as the
 * window lasts.
 *
 * The dangerous part of that is obvious and gets handled here rather than left to
 * whoever configures it: a schedule that can take the tunnel away can strand a box
 * nobody can drive to this week. Hence `shouldBeUp`, which knows about the grace
 * period after a restart and about somebody who is on the page right now. Everything
 * in this file is pure; the acting lives in UplinkService.
 */

import { dayName } from './watchdog.js';
import type { Alert } from './alerts.js';

export type UplinkMode = 'always' | 'window';

export interface UplinkConfig {
  mode: UplinkMode;
  /** 0 = Sunday … 6 = Saturday, in the box's own timezone. */
  weekday: number;
  hour: number;
  minute: number;
  /** How long the window stays open. */
  durationMinutes: number;
  /**
   * How long the tunnel stays up after the service starts, whatever the schedule
   * says. You rebooted the box, or it rebooted itself — that is the moment you are
   * most likely to want in, and the moment a wrong schedule would lock you out.
   */
  bootGraceMinutes: number;
}

export const UPLINK_DEFAULTS: UplinkConfig = {
  mode: 'always',
  weekday: 0, // Sunday
  hour: 14,
  minute: 0,
  durationMinutes: 15,
  bootGraceMinutes: 10,
};

export const MAX_BUFFERED = 200;

export function isUplinkMode(v: unknown): v is UplinkMode {
  return v === 'always' || v === 'window';
}

/** The window that starts on the given local date, as a timestamp. */
function windowStartOn(d: Date, cfg: UplinkConfig): number {
  const s = new Date(d);
  s.setHours(cfg.hour, cfg.minute, 0, 0);
  return s.getTime();
}

/**
 * Is `now` inside a window? Yesterday is checked too, so a window that runs past
 * midnight (23:50 for half an hour) does not silently close at 00:00.
 */
export function inWindow(now: Date, cfg: UplinkConfig): boolean {
  const len = Math.max(1, cfg.durationMinutes) * 60_000;
  for (const back of [0, 1]) {
    const day = new Date(now);
    day.setDate(day.getDate() - back);
    if (day.getDay() !== cfg.weekday) continue;
    const start = windowStartOn(day, cfg);
    if (now.getTime() >= start && now.getTime() < start + len) return true;
  }
  return false;
}

/** When the next window opens. If one is open now, this is the one after it. */
export function nextWindowStart(now: Date, cfg: UplinkConfig): Date {
  const len = Math.max(1, cfg.durationMinutes) * 60_000;
  for (let i = 0; i <= 8; i += 1) {
    const day = new Date(now);
    day.setDate(day.getDate() + i);
    if (day.getDay() !== cfg.weekday) continue;
    const start = windowStartOn(day, cfg);
    if (start + len > now.getTime() && start > now.getTime()) return new Date(start);
  }
  // Unreachable for a valid weekday; a week ahead is a sane answer rather than a throw.
  return new Date(now.getTime() + 7 * 86_400_000);
}

/** "Sundays 14:00–14:15" — the same phrasing the page uses. */
export function describeWindow(cfg: UplinkConfig): string {
  const end = new Date(2000, 0, 1, cfg.hour, cfg.minute + Math.max(1, cfg.durationMinutes));
  const hh = (n: number) => String(n).padStart(2, '0');
  return `${dayName(cfg.weekday)}s ${hh(cfg.hour)}:${hh(cfg.minute)}–${hh(end.getHours())}:${hh(end.getMinutes())}`;
}

export interface UpDecision {
  up: boolean;
  /** Why, in the words the page shows. */
  reason: string;
}

/**
 * Should the tunnel be up right now? Four reasons it may be, and the order matters:
 * the two safety ones come first, so a schedule can never be the thing that locks
 * somebody out of a box they are actively working on.
 */
export function shouldBeUp(opts: {
  now: Date;
  cfg: UplinkConfig;
  /** When this service started, for the boot grace. */
  startedAt: number;
  /** Somebody has the page open (see someoneIsHere). */
  someoneIsHere: boolean;
  /** A manual "open it now" from the page, as a timestamp it runs until. */
  openUntil?: number | null;
}): UpDecision {
  const { now, cfg, startedAt, someoneIsHere, openUntil } = opts;
  if (cfg.mode === 'always') return { up: true, reason: 'always live' };

  const t = now.getTime();
  if (openUntil && t < openUntil) {
    return { up: true, reason: `opened by hand until ${new Date(openUntil).toLocaleTimeString()}` };
  }
  if (t - startedAt < Math.max(0, cfg.bootGraceMinutes) * 60_000) {
    const left = Math.ceil((Math.max(0, cfg.bootGraceMinutes) * 60_000 - (t - startedAt)) / 60_000);
    return { up: true, reason: `just started — staying reachable for another ${left} min` };
  }
  if (inWindow(now, cfg)) return { up: true, reason: `in the window (${describeWindow(cfg)})` };
  // Cutting the tunnel out from under somebody who is using it is how you turn a
  // saved megabyte into a drive to the site. Presence lapses on its own.
  if (someoneIsHere) return { up: true, reason: 'somebody is on the page right now' };
  return { up: false, reason: `outside the window — next ${describeWindow(cfg)}` };
}

/**
 * Does this request mean a person is looking at the page?
 *
 * Not every request does, and the difference costs money here. Anything on the
 * hotspot — a phone's captive-portal probe, a camera checking for internet — hits
 * this port and gets redirected to /setup. Treating that as "somebody is here" would
 * hold the tunnel open around the clock and quietly undo the whole mode, which is the
 * worst way for this to fail: the box looks configured and the bill says otherwise.
 *
 * The page's own polling is the honest signal. It calls `/api/…` every few seconds
 * while it is visible and stops when it is not, so that — and nothing else — counts.
 */
export function countsAsPresence(url: string | undefined): boolean {
  return (url ?? '').startsWith('/api/');
}

// ---- buffering ----

export interface BufferedAlert extends Alert {
  /** When it happened, not when it was sent. */
  at: number;
}

/** Newest kept, oldest dropped: a week of a flapping sensor must not eat the disk. */
export function addBuffered(buffer: BufferedAlert[], alert: Alert, at: number, max = MAX_BUFFERED): BufferedAlert[] {
  return [...buffer, { ...alert, at }].slice(-max);
}

/**
 * One message for everything that happened while the tunnel was down.
 *
 * Not one per alert: a sensor that flapped for six days would arrive as forty
 * notifications the moment the window opens, which is both expensive and useless.
 * Grouped by alert id, with the count and the span, so the phone shows one line per
 * thing that actually went wrong.
 */
export function digestBuffered(buffer: BufferedAlert[], siteName?: string): Alert | null {
  if (buffer.length === 0) return null;
  const groups = new Map<string, BufferedAlert[]>();
  for (const a of buffer) {
    const g = groups.get(a.id);
    if (g) g.push(a);
    else groups.set(a.id, [a]);
  }
  const when = (t: number) => new Date(t).toLocaleString();
  const lines: string[] = [];
  for (const [, g] of groups) {
    const last = g[g.length - 1];
    const head = g.length === 1
      ? `${last.title} — ${when(last.at)}`
      : `${last.title} — ${g.length}× between ${when(g[0].at)} and ${when(last.at)}`;
    lines.push(`${head}\n${last.message}`);
  }
  const high = buffer.some((a) => a.priority === 'high');
  const what = groups.size === 1 ? '1 thing' : `${groups.size} things`;
  return {
    id: 'uplink:digest',
    title: `${what} happened while ${siteName ?? 'the gateway'} was offline`,
    message: lines.join('\n\n'),
    priority: high ? 'high' : 'default',
    tags: high ? ['warning'] : ['mailbox'],
  };
}
