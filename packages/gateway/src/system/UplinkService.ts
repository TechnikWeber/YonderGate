/**
 * Puts the tunnel — and with it the alerts — on a schedule.
 *
 * The deciding is in uplink.ts and tested there; this owns the clock and the two
 * side effects: bringing Tailscale up or down, and telling the alert service to let
 * go of what it has been holding.
 *
 * The one rule it is built around: **it must never be the reason nobody can reach
 * the box.** Hence the boot grace, the refusal to cut somebody off mid-session, the
 * manual override, and the fact that a failed `tailscale up` is logged and retried
 * on the next tick rather than swallowed.
 */

import type { GatewayConfig } from '../config.js';
import type { SystemManager } from './index.js';
import type { AlertService } from './AlertService.js';
import { someoneIsHere } from './watchdog.js';
import { describeWindow, inWindow, nextWindowStart, shouldBeUp, type UpDecision } from './uplink.js';

export interface UplinkSnapshot {
  mode: 'always' | 'window';
  /** Should the tunnel be up right now, and why. */
  up: boolean;
  reason: string;
  window: string;
  inWindow: boolean;
  nextWindowAt: string | null;
  buffered: number;
  openUntil: string | null;
  lastChange: string | null;
}

export class UplinkService {
  private timer: NodeJS.Timeout | null = null;
  private readonly startedAt = Date.now();
  private openUntil: number | null = null;
  private lastApplied: boolean | null = null;
  private lastChange: string | null = null;
  private applying = false;

  constructor(
    private readonly config: GatewayConfig,
    private readonly system: SystemManager,
    private readonly alerts: AlertService,
    /** `lastApiAt`, not `lastRequestAt` — see countsAsPresence. */
    private readonly activity: { lastApiAt: number | null },
  ) {}

  /**
   * Thirty seconds: fine enough that a fifteen-minute window is not measurably
   * shortened, coarse enough to cost nothing. It is a local decision — no traffic.
   */
  start(intervalMs = 30_000): void {
    this.timer = setInterval(() => void this.tick(), intervalMs);
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** True while alerts must be held back. The alert service asks this per alert. */
  holdsAlerts(): boolean {
    return this.config.uplink.mode === 'window' && !this.decide().up;
  }

  /** Open the tunnel now for a while, from the page. */
  openFor(minutes: number): { ok: boolean; message: string } {
    const m = Math.max(1, Math.min(24 * 60, Math.round(minutes)));
    this.openUntil = Date.now() + m * 60_000;
    void this.tick();
    return { ok: true, message: `Open for ${m} min.` };
  }

  /** Close it again before the override or the window runs out. */
  closeNow(): { ok: boolean; message: string } {
    this.openUntil = null;
    void this.tick();
    return { ok: true, message: 'Closing — the schedule is back in charge.' };
  }

  snapshot(): UplinkSnapshot {
    const cfg = this.config.uplink;
    const now = new Date();
    const d = this.decide(now);
    return {
      mode: cfg.mode,
      up: d.up,
      reason: d.reason,
      window: describeWindow(cfg),
      inWindow: inWindow(now, cfg),
      nextWindowAt: cfg.mode === 'window' ? nextWindowStart(now, cfg).toISOString() : null,
      buffered: this.alerts.bufferedCount(),
      openUntil: this.openUntil ? new Date(this.openUntil).toISOString() : null,
      lastChange: this.lastChange,
    };
  }

  private decide(now = new Date()): UpDecision {
    return shouldBeUp({
      now,
      cfg: this.config.uplink,
      startedAt: this.startedAt,
      someoneIsHere: someoneIsHere(this.activity.lastApiAt, now.getTime()),
      openUntil: this.openUntil,
    });
  }

  private async tick(): Promise<void> {
    // In 'always' mode this service does nothing at all — it must not start touching
    // a tunnel the operator brought up by hand.
    if (this.config.uplink.mode !== 'window') {
      this.lastApplied = null;
      return;
    }
    if (this.applying) return;
    const want = this.decide();
    if (this.lastApplied === want.up) return;
    this.applying = true;
    try {
      // remoteUp/remoteDown rather than the Tailscale calls directly: the owner may
      // have picked ZeroTier or WireGuard, and a window that only works for one of the
      // three would be a setting that silently does nothing.
      const res = want.up
        ? await this.system.remoteUp(this.config.remoteAccess)
        : await this.system.remoteDown(this.config.remoteAccess);
      if (!res.ok) {
        // Left unmarked so the next tick tries again: failing to bring the tunnel up
        // and then never retrying is the failure mode that strands the box.
        console.warn(`[uplink] could not ${want.up ? 'open' : 'close'} the tunnel: ${res.message}`);
        return;
      }
      this.lastApplied = want.up;
      this.lastChange = `${new Date().toISOString()} — ${want.up ? 'opened' : 'closed'}: ${want.reason}`;
      console.log(`[uplink] ${want.up ? 'opened' : 'closed'} — ${want.reason}`);
      // Only once the tunnel is actually up: sending into a link that is still coming
      // together is how the one message of the week gets lost.
      if (want.up) await this.alerts.flushBuffered();
    } finally {
      this.applying = false;
    }
  }
}
