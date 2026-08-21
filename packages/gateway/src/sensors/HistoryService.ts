import { existsSync, mkdirSync, readdirSync, readFileSync, appendFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readingKey, type TelemetryMessage } from '@yondergate/protocol';
import {
  averageSamples,
  bucketFor,
  bucketize,
  csvHeader,
  csvRow,
  expiredFiles,
  filesForRange,
  partFile,
  parseHistoryCsv,
  type Bucket,
  type Sample,
} from './history.js';
import type { TelemetryService } from './TelemetryService.js';

/**
 * Records what the sensors did, so the page can answer "and yesterday?".
 *
 * Sampling every few seconds, one averaged row per minute, flushed in batches —
 * see history.ts for why. The flush interval is the one number with a real
 * trade-off: longer means fewer writes on the SD card, but a power cut loses that
 * much. Five minutes on a site that runs off a battery seemed the honest middle.
 */
export class HistoryService {
  private samples: Sample[] = [];
  private pending: { t: number; values: Record<string, number | null> }[] = [];
  private keys: string[] = [];
  private sampleTimer: NodeJS.Timeout | null = null;
  private minuteTimer: NodeJS.Timeout | null = null;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly dir: string,
    private readonly telemetry: TelemetryService,
    private readonly opts: { sampleMs?: number; flushMs?: number; keepMonths?: number } = {},
  ) {}

  start(): void {
    mkdirSync(this.dir, { recursive: true });
    this.sampleTimer = setInterval(() => this.sample(), this.opts.sampleMs ?? 10_000);
    this.minuteTimer = setInterval(() => this.rollMinute(), 60_000);
    this.flushTimer = setInterval(() => this.flush(), this.opts.flushMs ?? 5 * 60_000);
    // Prune once at start; a box that runs for a year does not need a daily timer
    // for this, and a restart is the natural moment to tidy up.
    this.prune();
  }

  async stop(): Promise<void> {
    for (const t of [this.sampleTimer, this.minuteTimer, this.flushTimer]) if (t) clearInterval(t);
    this.rollMinute();
    this.flush();
  }

  /** One reading of everything the telemetry service currently reports. */
  private sample(): void {
    const m = this.telemetry.message as TelemetryMessage | null | undefined;
    if (!m) return;
    const values: Record<string, number | null> = {};
    m.voltages?.forEach((r, i) => (values[readingKey('v', r.label, i)] = num(r.value)));
    m.currents?.forEach((r, i) => (values[readingKey('c', r.label, i)] = num(r.value)));
    m.temperatures?.forEach((r, i) => (values[readingKey('t', r.label, i)] = num(r.value)));
    if (typeof m.batteryPercent === 'number') values['pct:battery'] = m.batteryPercent;
    if (!Object.keys(values).length) return;
    this.samples.push({ t: Date.now(), values });
  }

  /** Fold the last minute's samples into one row. */
  private rollMinute(): void {
    if (!this.samples.length) return;
    const values = averageSamples(this.samples);
    this.samples = [];
    for (const k of Object.keys(values)) if (!this.keys.includes(k)) this.keys.push(k);
    this.pending.push({ t: Date.now(), values });
  }

  /**
   * Append the buffered rows.
   *
   * Each month gets its own file, and a file that does not exist yet is given a
   * header. The columns of an existing file are never shifted — a reader that
   * trusted the header would silently mis-attribute every earlier row — so when a
   * channel appears that the current file has no column for, the month continues in
   * a part file. Both are read back as one series.
   */
  private flush(): void {
    if (!this.pending.length) return;
    const rows = this.pending;
    this.pending = [];
    try {
      mkdirSync(this.dir, { recursive: true });
      for (const row of rows) {
        const path = this.fileFor(row.t, Object.keys(row.values));
        appendFileSync(path, csvRow(row.t, row.values, this.headerOf(path)));
      }
    } catch (err) {
      // Never let recording take the gateway down: a full card or a read-only
      // filesystem costs history, not the page that would tell you about it.
      console.warn(`[history] could not write: ${(err as Error).message}`);
    }
  }

  /**
   * The file this row belongs in: the month's file while its header still covers the
   * row's channels, otherwise the next part. Walks the parts rather than remembering
   * one, so a restart mid-month lands in the right place.
   */
  private fileFor(t: number, keys: string[]): string {
    for (let part = 1; part <= 50; part++) {
      const path = join(this.dir, partFile(t, part));
      if (!existsSync(path)) {
        writeFileSync(path, csvHeader(this.keys));
        this.headers.delete(path);
        return path;
      }
      const header = this.headerOf(path);
      if (keys.every((k) => header.includes(k))) return path;
    }
    // Fifty part files in one month means something is generating channel names;
    // keep recording into the last one rather than spawning files forever.
    return join(this.dir, partFile(t, 50));
  }

  /** Header cache — re-reading the first line of a growing CSV per row adds up. */
  private headers = new Map<string, string[]>();

  private headerOf(path: string): string[] {
    const hit = this.headers.get(path);
    if (hit) return hit;
    const keys = parseHistoryCsv(readFileSync(path, 'utf8').split('\n')[0] + '\n').keys;
    const resolved = keys.length ? keys : this.keys;
    this.headers.set(path, resolved);
    return resolved;
  }

  private fileNames(): string[] {
    try {
      return readdirSync(this.dir);
    } catch {
      return [];
    }
  }

  private prune(): void {
    try {
      const names = this.fileNames();
      for (const name of expiredFiles(names, Date.now(), this.opts.keepMonths ?? 13)) {
        rmSync(join(this.dir, name));
        console.log(`[history] pruned ${name}`);
      }
    } catch {
      /* nothing recorded yet */
    }
  }

  /** Series for a time range, averaged to a readable number of points. */
  range(fromMs: number, toMs: number): { keys: string[]; points: Bucket[]; bucketMs: number } {
    const points: Sample[] = [];
    const keys = new Set<string>();
    for (const name of filesForRange(fromMs, toMs, this.fileNames())) {
      const path = join(this.dir, name);
      if (!existsSync(path)) continue;
      try {
        const file = parseHistoryCsv(readFileSync(path, 'utf8'));
        file.keys.forEach((k) => keys.add(k));
        for (const p of file.points) if (p.t >= fromMs && p.t <= toMs) points.push(p);
      } catch {
        /* skip an unreadable month rather than failing the whole range */
      }
    }
    // Include what has not been written yet, so the newest minutes are not missing
    // from a "last hour" view just because the flush timer has not fired.
    for (const row of this.pending) if (row.t >= fromMs && row.t <= toMs) points.push(row);
    points.sort((a, b) => a.t - b.t);
    // Channel names come from the files, but for the first few minutes of a fresh
    // box there are no files yet — take them from the points too, or the page has
    // data and nothing to draw it under.
    for (const p of points) for (const k of Object.keys(p.values)) keys.add(k);
    const bucketMs = bucketFor(toMs - fromMs);
    return { keys: [...keys], points: bucketize(points, bucketMs), bucketMs };
  }
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
