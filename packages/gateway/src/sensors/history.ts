/**
 * Sensor history: what the numbers did while nobody was looking.
 *
 * A current reading tells you the site is fine *now*. The question you actually
 * have — did the battery recover yesterday, is it drifting down all week — needs
 * the past, and a box at a remote site is the only thing that can record it.
 *
 * **Sizing decided the design.** One row per minute with a handful of channels is
 * about 40 bytes, so a full year is ~21 MB — 0.1 % of a 16 GB card. There is
 * therefore no need for the usual tiers of ever-coarser data: minute resolution is
 * kept for the whole retention window, and longer views are averaged **on read**.
 * Simpler to write, simpler to trust, and nothing is lost to a downsampling pass
 * that ran once and cannot be undone.
 *
 * What is not free is **writing**: an SD card dislikes constant small appends. So
 * samples are averaged into a minute row in memory and flushed in batches — a few
 * hundred writes a day instead of tens of thousands.
 *
 * Everything here is pure. The file handling lives in HistoryService.
 */

export interface Sample {
  /** Unix ms. */
  t: number;
  /** readingKey → value; null when that channel had no reading at the time. */
  values: Record<string, number | null>;
}

/** Mean per channel, ignoring the moments a channel had nothing to say. */
export function averageSamples(samples: Sample[]): Record<string, number | null> {
  // Every key that appeared is kept, even if it never carried a number: "this
  // channel exists and had nothing to say" is a different fact from "no such
  // channel", and only the first should leave a gap in the row.
  const sums = new Map<string, { sum: number; n: number }>();
  for (const s of samples) {
    for (const [k, v] of Object.entries(s.values)) {
      const acc = sums.get(k) ?? { sum: 0, n: 0 };
      if (v !== null && Number.isFinite(v)) {
        acc.sum += v;
        acc.n += 1;
      }
      sums.set(k, acc);
    }
  }
  const out: Record<string, number | null> = {};
  for (const [k, acc] of sums) out[k] = acc.n ? round3(acc.sum / acc.n) : null;
  return out;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * CSV, because it survives everything: a half-written line is one lost minute, not
 * a corrupt database, and you can read a year of it with `tail` over SSH.
 */
export function csvHeader(keys: string[]): string {
  return `t,${keys.join(',')}\n`;
}

export function csvRow(t: number, values: Record<string, number | null>, keys: string[]): string {
  const cells = keys.map((k) => {
    const v = values[k];
    return v === null || v === undefined || !Number.isFinite(v) ? '' : String(round3(v));
  });
  return `${Math.round(t / 1000)},${cells.join(',')}\n`;
}

export interface HistoryFile {
  keys: string[];
  points: Sample[];
}

/**
 * Parse a history file. Unknown or damaged lines are skipped rather than throwing:
 * a year of measurements must not be lost to one bad row written during a power cut.
 */
export function parseHistoryCsv(text: string): HistoryFile {
  const lines = (text ?? '').split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return { keys: [], points: [] };
  const keys = lines[0].split(',').slice(1);
  const points: Sample[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const t = Number(cells[0]);
    if (!Number.isFinite(t) || cells.length !== keys.length + 1) continue;
    const values: Record<string, number | null> = {};
    keys.forEach((k, i) => {
      const raw = cells[i + 1];
      const v = raw === '' ? null : Number(raw);
      values[k] = v === null || !Number.isFinite(v) ? null : v;
    });
    points.push({ t: t * 1000, values });
  }
  return { keys, points };
}

/** One file per month: big enough to be few files, small enough to read quickly. */
export function monthFile(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}.csv`;
}

/** The month files a time range touches, oldest first. */
export function filesForRange(from: number, to: number): string[] {
  const out: string[] = [];
  const cursor = new Date(Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), 1));
  const end = new Date(to);
  while (cursor.getTime() <= end.getTime()) {
    out.push(monthFile(cursor.getTime()));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

/**
 * Files past the retention window. Kept deliberately generous (13 months) so a
 * "same month last year" comparison still works on the last day of the month.
 */
export function expiredFiles(names: string[], now: number, keepMonths = 13): string[] {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - keepMonths);
  const cutoffName = monthFile(cutoff.getTime());
  return names.filter((n) => /^\d{4}-\d{2}\.csv$/.test(n) && n < cutoffName);
}

export interface Bucket {
  t: number;
  values: Record<string, number | null>;
  /** Extremes inside the bucket — a battery's worst moment is the interesting one. */
  min: Record<string, number | null>;
  max: Record<string, number | null>;
}

/**
 * Average points into buckets for display. Min and max travel alongside the mean,
 * because on a battery the dip under load is exactly what an average hides.
 */
export function bucketize(points: Sample[], bucketMs: number): Bucket[] {
  if (bucketMs <= 0 || !points.length) {
    return points.map((p) => ({ t: p.t, values: p.values, min: p.values, max: p.values }));
  }
  const buckets = new Map<number, Sample[]>();
  for (const p of points) {
    const key = Math.floor(p.t / bucketMs) * bucketMs;
    const list = buckets.get(key) ?? [];
    list.push(p);
    buckets.set(key, list);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, list]) => ({
      t,
      values: averageSamples(list),
      min: extremes(list, Math.min),
      max: extremes(list, Math.max),
    }));
}

function extremes(list: Sample[], pick: (a: number, b: number) => number): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const s of list) {
    for (const [k, v] of Object.entries(s.values)) {
      if (v === null || !Number.isFinite(v)) continue;
      const cur = out[k];
      out[k] = cur === null || cur === undefined ? v : pick(cur, v);
    }
  }
  return out;
}

/** Bucket width that keeps a range under `maxPoints`, rounded to something readable. */
export function bucketFor(rangeMs: number, maxPoints = 300): number {
  const raw = rangeMs / maxPoints;
  const steps = [
    60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000,
    3_600_000, 3 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000,
    86_400_000, 7 * 86_400_000,
  ];
  return steps.find((s) => s >= raw) ?? steps[steps.length - 1];
}

/** Named ranges the UI offers, in ms. */
export const RANGES: Record<string, number> = {
  hour: 3_600_000,
  day: 86_400_000,
  week: 7 * 86_400_000,
  month: 30 * 86_400_000,
  year: 365 * 86_400_000,
};
