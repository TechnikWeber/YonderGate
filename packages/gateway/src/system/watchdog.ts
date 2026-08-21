/**
 * Getting back online without anyone there to help.
 *
 * `Restart=always` in a systemd unit catches a process that *crashed*. It does
 * nothing about the failures that actually happen at a remote site: an LTE session
 * that is up but carries nothing, a modem that answers but stopped routing,
 * Tailscale logged out after a token expired. From the inside all of those look
 * healthy — the only honest test is whether traffic still reaches the outside.
 *
 * So: probe, and escalate. Cheap and local first, disruptive last.
 *
 *   1. re-run `tailscale up`      — costs nothing, fixes a logged-out tunnel
 *   2. restart the network stack  — redials LTE, rebuilds the routes
 *   3. reboot                     — the blunt one, and only if allowed
 *
 * Each step needs its own run of failures, so a thirty-second outage never gets
 * anywhere near a reboot. Everything here is pure; the acting lives in the service.
 */

export type WatchdogAction = 'none' | 'tailscale' | 'network' | 'reboot';

export interface WatchdogConfig {
  enabled: boolean;
  /** Minutes between probes. */
  intervalMinutes: number;
  /** What to ping. A plain address, so a broken DNS does not read as a dead link. */
  target: string;
  /** Consecutive failures before each step. */
  afterTailscale: number;
  afterNetwork: number;
  /** 0 disables the reboot step entirely. */
  afterReboot: number;
}

export const WATCHDOG_DEFAULTS: WatchdogConfig = {
  enabled: false,
  intervalMinutes: 5,
  target: '1.1.1.1',
  afterTailscale: 2,
  afterNetwork: 4,
  afterReboot: 8,
};

/**
 * Which step is due after this many consecutive failures. Steps fire **once** at
 * their threshold rather than on every probe past it — repeating "restart the
 * network" every five minutes helps nothing and hides whether the previous attempt
 * did anything.
 */
export function nextWatchdogAction(failures: number, cfg: WatchdogConfig): WatchdogAction {
  if (!cfg.enabled) return 'none';
  if (cfg.afterReboot > 0 && failures === cfg.afterReboot) return 'reboot';
  if (failures === cfg.afterNetwork) return 'network';
  if (failures === cfg.afterTailscale) return 'tailscale';
  return 'none';
}

/** How the escalation reads in the log and in an alert. */
export function describeAction(action: WatchdogAction, failures: number, cfg: WatchdogConfig): string {
  const mins = failures * cfg.intervalMinutes;
  switch (action) {
    case 'tailscale':
      return `No route to ${cfg.target} for ${mins} minutes — bringing Tailscale up again.`;
    case 'network':
      return `Still no route to ${cfg.target} after ${mins} minutes — restarting the network stack (this redials LTE).`;
    case 'reboot':
      return `No route to ${cfg.target} for ${mins} minutes and restarts did not help — rebooting.`;
    default:
      return '';
  }
}

export interface RebootSchedule {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday, in the box's own timezone. */
  weekday: number;
  /** Hour of the day, 0–23. */
  hour: number;
}

export const REBOOT_DEFAULTS: RebootSchedule = { enabled: true, weekday: 0, hour: 4 };

/**
 * Is a scheduled reboot due?
 *
 * A weekly reboot on an unattended box is a crutch, and a cheap one: it clears
 * leaked memory, wedged USB modems and drivers that stopped talking, none of which
 * anyone will be there to notice. The guard that matters is the **uptime check** —
 * without it, a box that comes up inside its own reboot window reboots again, and
 * a site you cannot reach is now in a loop. Two hours of uptime is far longer than
 * a boot takes and far shorter than a week.
 */
export function dueForReboot(now: Date, schedule: RebootSchedule, uptimeS: number | null): { due: boolean; reason: string } {
  if (!schedule.enabled) return { due: false, reason: 'scheduled reboot is off' };
  if (now.getDay() !== schedule.weekday || now.getHours() !== schedule.hour) {
    return { due: false, reason: 'not in the window' };
  }
  if (uptimeS !== null && uptimeS < 2 * 3600) {
    return { due: false, reason: 'just booted — not rebooting again inside the same window' };
  }
  return { due: true, reason: `weekly reboot (${dayName(schedule.weekday)} ${String(schedule.hour).padStart(2, '0')}:00)` };
}

export function dayName(weekday: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday] ?? String(weekday);
}

/** A ping target: an address, not a name — a broken DNS is not a dead link. */
export function isProbeTarget(v: unknown): v is string {
  return typeof v === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(v.trim());
}
