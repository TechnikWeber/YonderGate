import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GatewayConfig } from '../config.js';
import type { SystemManager } from './index.js';
import type { AlertService } from './AlertService.js';
import {
  canReboot,
  describeAction,
  dueForReboot,
  nextWatchdogAction,
  recordReboot,
  someoneIsHere,
  REBOOT_BUDGET_EMPTY,
  type RebootBudget,
} from './watchdog.js';

/**
 * Runs the probe, escalates, and says what it did.
 *
 * Deliberately noisy in the log and quiet on the wire: every action is announced
 * *before* it happens, because an action that fixes the link is also the reason the
 * message about it can finally be delivered — and one that does not fix it leaves
 * the log as the only witness.
 */
export class WatchdogService {
  private failures = 0;
  private timer: NodeJS.Timeout | null = null;
  private rebootTimer: NodeJS.Timeout | null = null;
  private budget: RebootBudget = { ...REBOOT_BUDGET_EMPTY };
  private readonly budgetPath: string;

  constructor(
    private readonly config: GatewayConfig,
    private readonly system: SystemManager,
    private readonly alerts: AlertService,
    /** When the page was last used, so a reboot cannot kick out whoever is on it. */
    private readonly activity: { lastRequestAt: number | null } = { lastRequestAt: null },
    /**
     * Should the tunnel be up at all right now? In window mode outside the window it
     * must not be, and step 1 of the ladder — `tailscale up` — would otherwise undo
     * the whole point of the mode every time a probe failed. Defaults to yes, so a
     * gateway with no window configured behaves exactly as before.
     */
    private readonly tunnelWanted: () => boolean = () => true,
  ) {
    this.budgetPath = join(config.stateDir, 'watchdog.json');
    this.loadBudget();
  }

  start(): void {
    this.timer = setInterval(() => void this.probe(), Math.max(1, this.config.watchdog.intervalMinutes) * 60_000);
    // The scheduled reboot is checked every ten minutes rather than with a cron
    // expression: no extra dependency, and a box whose clock jumped forward past
    // its window still catches the next one.
    this.rebootTimer = setInterval(() => void this.maybeReboot(), 10 * 60_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.rebootTimer) clearInterval(this.rebootTimer);
  }

  /** State for the page: probes failed, and what the reboot budget allows. */
  snapshot(): {
    failures: number;
    lastCheck: string | null;
    lastAction: string | null;
    rebootsToday: number;
    lastRebootAt: string | null;
    rebootAllowed: string;
  } {
    const budget = canReboot(this.budget, Date.now());
    return {
      failures: this.failures,
      lastCheck: this.lastCheck,
      lastAction: this.lastAction,
      rebootsToday: this.budget.count,
      lastRebootAt: this.budget.lastRebootAt ? new Date(this.budget.lastRebootAt).toISOString() : null,
      rebootAllowed: budget.reason,
    };
  }

  private lastCheck: string | null = null;
  private lastAction: string | null = null;

  private async probe(): Promise<void> {
    if (!this.config.watchdog.enabled) return;
    const ok = await this.system.reachable(this.config.watchdog.target);
    this.lastCheck = new Date().toISOString();
    if (ok) {
      if (this.failures) console.log(`[watchdog] back online after ${this.failures} failed probes`);
      this.failures = 0;
      return;
    }
    this.failures += 1;
    let action = nextWatchdogAction(this.failures, this.config.watchdog);
    if (action === 'tailscale' && !this.tunnelWanted()) {
      // Not a failure of the ladder: the tunnel is *supposed* to be down. Skip this
      // rung and let the count carry on to the ones that still make sense.
      console.log('[watchdog] skipping the tailscale step — the uplink window is closed');
      action = 'none';
    }
    if (action === 'none') {
      console.log(`[watchdog] probe ${this.failures} failed`);
      return;
    }
    if (action === 'reboot') {
      const blocked = this.rebootBlockedReason(Date.now());
      if (blocked) {
        // The ladder below still ran; we simply do not reach for the big hammer.
        console.warn(`[watchdog] would reboot, but ${blocked}`);
        this.lastAction = `${new Date().toISOString()} — reboot skipped: ${blocked}`;
        void this.alerts.notify({
          id: 'watchdog:reboot-skipped',
          title: 'Uplink still down',
          message: `The gateway would reboot, but ${blocked}. Local access is unaffected.`,
          priority: 'default',
          tags: ['warning'],
        });
        return;
      }
    }
    const what = describeAction(action, this.failures, this.config.watchdog);
    console.warn(`[watchdog] ${what}`);
    this.lastAction = `${new Date().toISOString()} — ${what}`;
    // Announced before acting, and best-effort: the link being down is exactly why
    // this message may not arrive, and that must not stop the recovery.
    void this.alerts.notify({
      id: `watchdog:${action}`,
      title: 'Uplink recovery',
      message: what,
      priority: action === 'reboot' ? 'high' : 'default',
      tags: ['satellite'],
    });
    if (action === 'reboot') this.noteReboot();
    await this.system.recover(action);
  }

  /** Why a reboot must not happen now, or null when it may. */
  private rebootBlockedReason(now: number): string | null {
    if (someoneIsHere(this.activity.lastRequestAt, now)) {
      return 'someone is using this page right now — the uplink being down does not break local access';
    }
    const budget = canReboot(this.budget, now);
    return budget.allowed ? null : budget.reason;
  }

  private noteReboot(): void {
    this.budget = recordReboot(this.budget, Date.now());
    this.saveBudget();
  }

  private loadBudget(): void {
    try {
      if (existsSync(this.budgetPath)) this.budget = JSON.parse(readFileSync(this.budgetPath, 'utf8')) as RebootBudget;
    } catch {
      /* a lost budget file means one extra reboot at worst */
    }
  }

  private saveBudget(): void {
    try {
      mkdirSync(this.config.stateDir, { recursive: true });
      // Written BEFORE the reboot: a budget that only survives in memory is no
      // budget at all, and that was exactly the loop this prevents.
      writeFileSync(this.budgetPath, JSON.stringify(this.budget, null, 2));
    } catch (err) {
      console.warn(`[watchdog] could not record the reboot: ${(err as Error).message}`);
    }
  }

  private async maybeReboot(): Promise<void> {
    const health = await this.system.health();
    const due = dueForReboot(new Date(), this.config.reboot, health.uptimeS);
    if (!due.due) return;
    // The weekly reboot is deliberate maintenance, but it still yields to someone
    // working on the box.
    if (someoneIsHere(this.activity.lastRequestAt, Date.now())) {
      console.log('[reboot] skipping the weekly reboot — someone is using the page');
      return;
    }
    console.warn(`[reboot] ${due.reason}`);
    this.lastAction = `${new Date().toISOString()} — ${due.reason}`;
    this.noteReboot();
    await this.system.reboot();
  }
}
