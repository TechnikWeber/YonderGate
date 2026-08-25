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
  /**
   * Bytes since the credit was last topped up — deliberately *not* reset by the
   * billing month. A prepaid card billed per megabyte has no month: what runs out
   * is the credit, whenever that happens to be. Optional so an existing usage.json
   * from before this feature loads unchanged.
   */
  sinceTopUp?: number;
  /** When the operator last recorded a top-up (ISO). */
  topUpAt?: string | null;
}

export function emptyUsage(month: string): UsageState {
  return { month, bytes: 0, lastCounter: null, updated: null, sinceTopUp: 0, topUpAt: null };
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
  // A new month zeroes the monthly figure but must not touch the credit total: the
  // two answer different questions and only one of them cares about calendars.
  const carried = { sinceTopUp: prev.sinceTopUp ?? 0, topUpAt: prev.topUpAt ?? null };
  const base = prev.month === month ? prev : { ...emptyUsage(month), ...carried, lastCounter: prev.lastCounter };
  if (counter === null || !Number.isFinite(counter) || counter < 0) return base;
  if (base.lastCounter === null || counter < base.lastCounter) {
    return { ...base, lastCounter: counter, updated: new Date(now).toISOString() };
  }
  const delta = counter - base.lastCounter;
  return {
    ...base,
    month,
    bytes: base.bytes + delta,
    sinceTopUp: (base.sinceTopUp ?? 0) + delta,
    lastCounter: counter,
    updated: new Date(now).toISOString(),
  };
}

/** The operator put money on the card: the credit total starts again from here. */
export function recordTopUp(prev: UsageState, now: number): UsageState {
  return { ...prev, sinceTopUp: 0, topUpAt: new Date(now).toISOString() };
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

/**
 * Every interface's counters at once. The uplink total is what costs money; this is
 * what says **where it came from** — the AP, the site LAN, or the box itself. `lo` is
 * dropped (it is the box talking to itself and would dwarf everything), and so is any
 * interface that has moved nothing at all, which on a Pi is most of them.
 *
 * These are since-boot counters, which is exactly as long as they are meaningful: the
 * kernel resets them on reboot, and this box reboots weekly by default.
 */
export interface InterfaceCounter {
  name: string;
  rx: number;
  tx: number;
}

export function parseInterfaceCounters(out: string): InterfaceCounter[] {
  const counters: InterfaceCounter[] = [];
  for (const line of (out ?? '').split('\n')) {
    const [rawName, rest] = line.split(':');
    if (!rest) continue;
    const name = rawName.trim();
    if (!name || name === 'lo' || /^(Inter|face)/.test(name)) continue;
    const cols = rest.trim().split(/\s+/).map(Number);
    const rx = cols[0];
    const tx = cols[8];
    if (!Number.isFinite(rx) || !Number.isFinite(tx)) continue;
    if (rx + tx === 0) continue;
    counters.push({ name, rx, tx });
  }
  return counters.sort((a, b) => b.rx + b.tx - (a.rx + a.tx));
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

/**
 * The month at a glance: used, left, and how long that has to last. "1.9 GB left
 * with 9 days to go" is the sentence someone can act on; a percentage alone is not.
 */
export function usageOverview(usage: UsageState, capGb: number | null, now: number): {
  usedBytes: number;
  capBytes: number | null;
  leftBytes: number | null;
  percent: number | null;
  daysLeft: number;
  perDayLeft: number | null;
} {
  const d = new Date(now);
  const endOfMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const daysLeft = Math.max(1, Math.ceil((endOfMonth - now) / 86_400_000));
  const st = usageStatus(usage, capGb);
  const leftBytes = st.capBytes === null ? null : Math.max(0, st.capBytes - usage.bytes);
  return {
    usedBytes: usage.bytes,
    capBytes: st.capBytes,
    leftBytes,
    percent: st.percent,
    daysLeft,
    perDayLeft: leftBytes === null ? null : Math.round(leftBytes / daysLeft),
  };
}

/**
 * Where the *credit* stands, for a prepaid card billed per megabyte.
 *
 * The monthly allowance above answers "how much of this month's bucket is gone".
 * A card billed per MB has no bucket and no month — it has a balance that shrinks
 * until the box goes quiet. Same 80 % warning, different arithmetic: what is spent
 * is bytes × price, and what matters is the share of the credit that is gone.
 */
export function creditStatus(
  usage: UsageState,
  creditEur: number | null,
  pricePerMbCents: number | null,
  warnAt = 0.8,
): { spentEur: number | null; leftEur: number | null; percent: number | null; warn: boolean; over: boolean } {
  if (!creditEur || creditEur <= 0 || !pricePerMbCents || pricePerMbCents <= 0) {
    return { spentEur: null, leftEur: null, percent: null, warn: false, over: false };
  }
  const spentEur = ((usage.sinceTopUp ?? 0) / 1e6) * (pricePerMbCents / 100);
  const percent = Math.round((spentEur / creditEur) * 1000) / 10;
  return {
    spentEur,
    leftEur: Math.max(0, creditEur - spentEur),
    percent,
    warn: spentEur >= creditEur * warnAt,
    over: spentEur >= creditEur,
  };
}

/**
 * How long the rest of the credit lasts at the rate it has actually been spent.
 * "about 8 months left" is what tells you whether the next top-up is a calendar
 * entry or a problem — and on most German prepaid tariffs the top-up, not the
 * usage, is what keeps the card from being deactivated (see docs/DATA-BUDGET.md).
 */
export function creditForecast(
  usage: UsageState,
  creditEur: number | null,
  pricePerMbCents: number | null,
  now: number,
): { perDayEur: number | null; daysLeft: number | null } {
  const st = creditStatus(usage, creditEur, pricePerMbCents);
  const since = usage.topUpAt ? Date.parse(usage.topUpAt) : NaN;
  if (st.spentEur === null || !Number.isFinite(since)) return { perDayEur: null, daysLeft: null };
  // Under a day of history says nothing; projecting from it would be a wild guess
  // dressed up as a number.
  const days = (now - since) / 86_400_000;
  if (days < 1 || st.spentEur <= 0) return { perDayEur: null, daysLeft: null };
  const perDayEur = st.spentEur / days;
  return { perDayEur, daysLeft: Math.floor((st.leftEur ?? 0) / perDayEur) };
}

export interface DataPlanSettings {
  plan: 'monthly' | 'credit';
  capGb: number | null;
  creditEur: number | null;
  pricePerMbCents: number | null;
}

/**
 * One answer for both shapes, so the alert rule and the page do not each have to
 * know which kind of tariff this SIM is on.
 */
export function dataStatus(usage: UsageState, s: DataPlanSettings): {
  percent: number | null;
  warn: boolean;
  over: boolean;
  detail: string;
} {
  if (s.plan === 'credit') {
    const c = creditStatus(usage, s.creditEur, s.pricePerMbCents);
    return {
      percent: c.percent,
      warn: c.warn,
      over: c.over,
      detail: c.spentEur === null
        ? `${formatBytes(usage.sinceTopUp ?? 0)} since the last top-up (no credit set)`
        : `${c.spentEur.toFixed(2)} € of ${s.creditEur} € credit used (${c.percent}%), ${formatBytes(usage.sinceTopUp ?? 0)}`,
    };
  }
  const u = usageStatus(usage, s.capGb);
  return {
    percent: u.percent,
    warn: u.warn,
    over: u.over,
    detail: u.percent === null
      ? `${formatBytes(usage.bytes)} used this month (no allowance set)`
      : `${formatBytes(usage.bytes)} of ${s.capGb} GB used (${u.percent}%)`,
  };
}
