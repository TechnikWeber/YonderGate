import type { GatewayConfig } from '../config.js';
import type { SystemManager } from './index.js';
import type { AlertService } from './AlertService.js';
import { describeAction, dueForReboot, nextWatchdogAction } from './watchdog.js';

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

  constructor(
    private readonly config: GatewayConfig,
    private readonly system: SystemManager,
    private readonly alerts: AlertService,
  ) {}

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

  /** State for the page: how many probes in a row have failed. */
  snapshot(): { failures: number; lastCheck: string | null; lastAction: string | null } {
    return { failures: this.failures, lastCheck: this.lastCheck, lastAction: this.lastAction };
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
    const action = nextWatchdogAction(this.failures, this.config.watchdog);
    if (action === 'none') {
      console.log(`[watchdog] probe ${this.failures} failed`);
      return;
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
    await this.system.recover(action);
  }

  private async maybeReboot(): Promise<void> {
    const health = await this.system.health();
    const due = dueForReboot(new Date(), this.config.reboot, health.uptimeS);
    if (!due.due) return;
    console.warn(`[reboot] ${due.reason}`);
    this.lastAction = `${new Date().toISOString()} — ${due.reason}`;
    await this.system.reboot();
  }
}
