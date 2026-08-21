/**
 * How much mobile data the site has used this month.
 *
 * A gateway on a metered SIM is one forgotten camera stream away from an empty
 * allowance, and finding out afterwards is expensive. Two sources, because neither
 * is reliable on its own:
 *
 *  - **The stick's own counter** (HiLink `traffic-statistics`) is authoritative for
 *    what the carrier sees — but it resets when the stick reboots, and it knows
 *    nothing about a modem that isn't a HiLink.
 *  - **The kernel's interface counters** work for any uplink, but reset with every
 *    reboot of the Pi and count local traffic that never left the site.
 *
 * So the gateway keeps its own running total: it reads a counter periodically and
 * adds the *difference*, which survives both kinds of reset — a counter that went
 * backwards means "something restarted", not "we un-sent 4 GB".
 */

export interface UsageState {
  /** Billing month this total belongs to, `YYYY-MM`. */
  month: string;
  /** Bytes counted this month. */
  bytes: number;
  /** Last raw counter value seen, to compute the next difference. */
  lastCounter: number | null;
  /** When the total was last updated (ISO). */
  updated: string | null;
}

export function emptyUsage(month: string): UsageState {
  return { month, bytes: 0, lastCounter: null, updated: null };
}

export function billingMonth(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Fold a new counter reading into the running total.
 *
 * A counter that dropped means the source restarted; the reading is then taken as
 * the new baseline and nothing is added, because the alternative — treating the
 * drop as usage — would either subtract traffic that happened or add a fictional
 * gigabyte. A new month starts from zero.
 */
export function accumulate(prev: UsageState, counter: number | null, now: number): UsageState {
  const month = billingMonth(now);
  const base = prev.month === month ? prev : emptyUsage(month);
  if (counter === null || !Number.isFinite(counter) || counter < 0) return base;
  if (base.lastCounter === null || counter < base.lastCounter) {
    return { ...base, lastCounter: counter, updated: new Date(now).toISOString() };
  }
  return {
    month,
    bytes: base.bytes + (counter - base.lastCounter),
    lastCounter: counter,
    updated: new Date(now).toISOString(),
  };
}

/** `/proc/net/dev` → total bytes in+out for one interface. */
export function parseProcNetDev(out: string, iface: string): number | null {
  for (const line of (out ?? '').split('\n')) {
    const [name, rest] = line.split(':');
    if (!rest || name.trim() !== iface) continue;
    const cols = rest.trim().split(/\s+/).map(Number);
    const rx = cols[0];
    const tx = cols[8];
    if (!Number.isFinite(rx) || !Number.isFinite(tx)) return null;
    return rx + tx;
  }
  return null;
}

/** HiLink `/api/monitoring/traffic-statistics` → bytes since the stick last reset. */
export function parseHilinkTraffic(values: Record<string, string>): number | null {
  const up = Number(values.TotalUpload);
  const down = Number(values.TotalDownload);
  if (!Number.isFinite(up) && !Number.isFinite(down)) return null;
  return (Number.isFinite(up) ? up : 0) + (Number.isFinite(down) ? down : 0);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} kB`;
  return `${bytes} B`;
}

/**
 * Where the month stands against the allowance. The warning fires at a share of
 * the cap rather than at a fixed number left, because "80 % of 5 GB" and "80 % of
 * 50 GB" mean the same thing to the person who has to decide whether to stream a
 * camera for another week.
 */
export function usageStatus(
  usage: UsageState,
  capGb: number | null,
  warnAt = 0.8,
): { percent: number | null; warn: boolean; over: boolean; capBytes: number | null } {
  if (!capGb || capGb <= 0) return { percent: null, warn: false, over: false, capBytes: null };
  const capBytes = capGb * 1e9;
  const percent = Math.round((usage.bytes / capBytes) * 1000) / 10;
  return { percent, warn: usage.bytes >= capBytes * warnAt, over: usage.bytes >= capBytes, capBytes };
}
