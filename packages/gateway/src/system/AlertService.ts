import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readingKey, type TelemetryMessage } from '@yondergate/protocol';
import type { GatewayConfig } from '../config.js';
import type { SystemManager } from './index.js';
import type { TelemetryService } from '../sensors/TelemetryService.js';
import {
  evaluateRule,
  isNtfyUrl,
  ntfyRequest,
  sensorBreached,
  type Alert,
  type AlertState,
} from './alerts.js';
import { accumulate, emptyUsage, billingMonth, formatBytes, usageStatus, type UsageState } from './usage.js';
import { addBuffered, digestBuffered, type BufferedAlert } from './uplink.js';
import { shouldAutoCycle } from './power.js';

/** How often the running total reaches the card. See updateUsage(). */
export const USAGE_SAVE_INTERVAL_MS = 15 * 60_000;

/**
 * Watches, decides, and speaks up. The deciding is in alerts.ts and tested there;
 * this part owns the clock, the counters and the one HTTP request.
 *
 * It also keeps the data counter, because that is where the numbers arrive anyway:
 * a raw counter every minute, folded into a monthly total that survives a stick
 * reboot (see usage.ts) and written next to the history rather than into the
 * config — it changes constantly and is state, not settings.
 */
export class AlertService {
  private states = new Map<string, AlertState>();
  private usage: UsageState = emptyUsage(billingMonth(Date.now()));
  private timer: NodeJS.Timeout | null = null;
  private readonly statePath: string;
  /** Set by UplinkService: true while alerts must wait for the next window. */
  private holdGate: () => boolean = () => false;
  private buffer: BufferedAlert[] = [];
  private readonly bufferPath: string;

  constructor(
    private readonly config: GatewayConfig,
    private readonly system: SystemManager,
    private readonly telemetry: TelemetryService,
  ) {
    this.statePath = join(config.stateDir, 'usage.json');
    this.bufferPath = join(config.stateDir, 'alert-buffer.json');
    this.load();
    this.loadBuffer();
  }

  start(intervalMs = 60_000): void {
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.save();
  }

  snapshot(): { usage: UsageState; status: ReturnType<typeof usageStatus> } {
    return { usage: this.usage, status: usageStatus(this.usage, this.config.data.capGb) };
  }

  /** Send one alert from elsewhere in the box (the watchdog uses this). */
  async notify(alert: Alert): Promise<{ ok: boolean; message: string }> {
    if (!this.config.alerts.enabled) return { ok: false, message: 'Alerts are off.' };
    return this.send(alert);
  }

  /**
   * Send one message by hand, so "does this actually reach my phone" is answerable.
   * Deliberately goes past the hold gate: a test that gets filed away until Sunday
   * answers nothing, and the operator pressing it is already here.
   */
  async test(): Promise<{ ok: boolean; message: string }> {
    const alert: Alert = {
      id: 'test',
      title: 'Test message',
      message: 'If you can read this, alerts from this gateway work.',
      priority: 'default',
      tags: ['bell'],
    };
    return this.deliver(alert);
  }

  private async tick(): Promise<void> {
    // The counter runs even when alerting is off: knowing what the SIM used is
    // useful on its own, and it would be odd to lose the month because nobody
    // wanted push messages.
    await this.updateUsage();
    if (!this.config.alerts.enabled) return;

    const now = Date.now();
    const [health, reachable] = await Promise.all([
      this.system.health(),
      this.system.probeDevices(this.config.devices),
    ]);
    const telemetry = this.telemetry.message as TelemetryMessage | null | undefined;
    const values = readingsOf(telemetry);
    const usage = usageStatus(this.usage, this.config.data.capGb);

    for (const rule of this.config.alerts.rules) {
      const prev = this.states.get(rule.id) ?? { since: null, firedAt: null };
      let breached = false;
      let detail = '';

      if (rule.kind === 'sensor') {
        const r = sensorBreached(rule, values[rule.target]);
        breached = r.breached;
        detail = r.detail;
      } else if (rule.kind === 'device') {
        const device = this.config.devices.find((d) => d.id === rule.target);
        // A device that was deleted cannot be missing.
        if (!device) continue;
        breached = reachable[device.id] === false;
        detail = breached
          ? `${device.label} (${device.ip}) is not answering`
          : `${device.label} (${device.ip}) is answering`;
      } else if (rule.kind === 'usage') {
        breached = usage.warn;
        detail = usage.percent === null
          ? 'no allowance configured'
          : `${formatBytes(this.usage.bytes)} of ${this.config.data.capGb} GB used (${usage.percent}%)`;
      } else if (rule.kind === 'health') {
        if (rule.target === 'undervoltage') {
          breached = health.undervoltageNow === true;
          detail = 'The supply voltage is sagging right now — check the power supply and cable.';
        } else if (rule.target === 'disk') {
          breached = health.diskUsedPercent !== null && health.diskUsedPercent > 90;
          detail = `${health.diskFreeMb ?? '?'} MB free`;
        } else if (rule.target === 'clock') {
          breached = health.clockSynced === false;
          detail = 'The clock is not synchronised — recorded timestamps cannot be trusted.';
        }
      }

      const { next, alert } = evaluateRule(rule, breached, detail, prev, now);
      this.states.set(rule.id, next);
      if (alert) await this.send(alert);
    }

    await this.autoCycle(reachable, now);
  }

  private cycledAt = new Map<string, number>();

  /**
   * A device that stopped answering and has a switch behind it gets power-cycled —
   * once, then an hour of quiet. This is the one place where the box does something
   * about a fault instead of describing it, so it is also the place that must not
   * turn a flapping link into a switch clacking all night.
   */
  private async autoCycle(reachable: Record<string, boolean>, now: number): Promise<void> {
    for (const sw of this.config.switches) {
      const unreachable = sw.deviceId ? reachable[sw.deviceId] === false : false;
      if (!shouldAutoCycle(sw, unreachable, this.cycledAt.get(sw.id) ?? null, now)) continue;
      this.cycledAt.set(sw.id, now);
      const device = this.config.devices.find((d) => d.id === sw.deviceId);
      const what = `${device?.label ?? sw.deviceId} stopped answering — power-cycling it via ${sw.label}.`;
      console.warn(`[power] ${what}`);
      void this.notify({ id: `autocycle:${sw.id}`, title: 'Power cycle', message: what, priority: 'default', tags: ['electric_plug'] });
      await this.system.setSwitch(sw, 'cycle');
    }
  }

  /**
   * The total is updated every minute but written to the card every quarter hour.
   *
   * Recording sensor history is opt-in precisely to spare the SD card, so a counter
   * that rewrites a file 525 600 times a year would have quietly undone that. The
   * in-memory total stays exact; what a power cut costs is not the month's total but
   * the traffic since the last write — the next reading re-baselines against the
   * stick's counter, so nothing is double-counted either way. A clean shutdown
   * writes unconditionally.
   */
  private async updateUsage(): Promise<void> {
    const counter = await this.system.dataCounter(this.config.data.source, this.config.data.iface);
    const before = this.usage.bytes;
    this.usage = accumulate(this.usage, counter, Date.now());
    if (this.usage.bytes === before) return;
    const now = Date.now();
    if (this.savedAt !== null && now - this.savedAt < USAGE_SAVE_INTERVAL_MS) return;
    this.save();
  }

  private savedAt: number | null = null;

  /** How many alerts are waiting for the window. Shown on the page. */
  bufferedCount(): number {
    return this.buffer.length;
  }

  /**
   * Called by UplinkService when the mode says alerts must wait. Kept as a callback
   * rather than a reference so this service does not need to know what an uplink is.
   */
  setHoldGate(fn: () => boolean): void {
    this.holdGate = fn;
  }

  /**
   * Everything that happened while the tunnel was down, as one message.
   *
   * On failure the buffer is kept: the window is the one chance these have of being
   * delivered, and throwing them away because ntfy blinked would lose a week of the
   * only thing this box is there to tell you. It is cleared only once ntfy took it.
   */
  async flushBuffered(): Promise<{ ok: boolean; message: string }> {
    if (this.buffer.length === 0) return { ok: true, message: 'Nothing was waiting.' };
    const digest = digestBuffered(this.buffer, this.config.siteName);
    if (!digest) return { ok: true, message: 'Nothing was waiting.' };
    const held = this.buffer.length;
    const res = await this.deliver(digest);
    if (res.ok) {
      this.buffer = [];
      this.saveBuffer();
      console.log(`[alert] window opened — sent ${held} buffered alert(s) as one message`);
    } else {
      console.warn(`[alert] could not send the buffered ${held}: ${res.message} — keeping them`);
    }
    return res;
  }

  private loadBuffer(): void {
    try {
      if (existsSync(this.bufferPath)) this.buffer = JSON.parse(readFileSync(this.bufferPath, 'utf8')) as BufferedAlert[];
    } catch {
      /* a corrupt buffer costs the held alerts, not the service */
    }
  }

  private saveBuffer(): void {
    try {
      mkdirSync(this.config.stateDir, { recursive: true });
      writeFileSync(this.bufferPath, JSON.stringify(this.buffer));
    } catch {
      /* read-only or full: they stay in memory and are lost on a reboot */
    }
  }

  /**
   * The gate every alert passes. In window mode outside the window this writes to
   * disk instead of the network — a week can hold a reboot, and an alert that only
   * ever lived in RAM would be the one the operator never hears about.
   */
  private async send(alert: Alert): Promise<{ ok: boolean; message: string }> {
    if (this.holdGate()) {
      this.buffer = addBuffered(this.buffer, alert, Date.now());
      this.saveBuffer();
      console.log(`[alert] held for the next window (${this.buffer.length} waiting): ${alert.title}`);
      return { ok: true, message: `Held for the next window — ${this.buffer.length} waiting.` };
    }
    return this.deliver(alert);
  }

  private async deliver(alert: Alert): Promise<{ ok: boolean; message: string }> {
    const url = this.config.alerts.ntfyUrl;
    if (!isNtfyUrl(url)) {
      return { ok: false, message: 'No ntfy topic configured — nothing was sent.' };
    }
    const req = ntfyRequest({ url, token: this.config.alerts.ntfyToken }, alert, this.config.siteName);
    try {
      const res = await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: req.body,
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return { ok: false, message: `ntfy answered ${res.status}.` };
      console.log(`[alert] sent: ${alert.title}`);
      return { ok: true, message: 'Sent.' };
    } catch (err) {
      // A failed alert must never take the gateway down — the uplink being gone is
      // exactly when this happens, and that is also when the box is needed most.
      console.warn(`[alert] could not send: ${(err as Error).message}`);
      return { ok: false, message: `Could not reach ntfy: ${(err as Error).message}` };
    }
  }

  private load(): void {
    try {
      if (existsSync(this.statePath)) this.usage = JSON.parse(readFileSync(this.statePath, 'utf8')) as UsageState;
    } catch {
      /* a corrupt counter file costs this month's total, not the service */
    }
  }

  private save(): void {
    try {
      mkdirSync(this.config.stateDir, { recursive: true });
      writeFileSync(this.statePath, JSON.stringify(this.usage, null, 2));
      this.savedAt = Date.now();
    } catch {
      /* read-only or full: the total keeps running in memory */
    }
  }
}

/** readingKey → value, in the same shape the history uses. */
function readingsOf(m: TelemetryMessage | null | undefined): Record<string, number | null> {
  const values: Record<string, number | null> = {};
  if (!m) return values;
  m.voltages?.forEach((r, i) => (values[readingKey('v', r.label, i)] = numeric(r.value)));
  m.currents?.forEach((r, i) => (values[readingKey('c', r.label, i)] = numeric(r.value)));
  m.temperatures?.forEach((r, i) => (values[readingKey('t', r.label, i)] = numeric(r.value)));
  if (typeof m.batteryPercent === 'number') values['pct:battery'] = m.batteryPercent;
  return values;
}

function numeric(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
