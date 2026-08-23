/**
 * Telling you something is wrong, without becoming noise.
 *
 * A box that only answers when asked is a box you have to remember to check. The
 * point of a gateway at a remote site is that it speaks up: the battery is below
 * the line, the camera you named has gone quiet, the SIM is nearly used up.
 *
 * The hard part is not sending — it is **not sending too much**. A flaky LTE link
 * makes a device disappear and come back all night; a battery hovering on the
 * threshold flaps every minute. So every rule has to hold for a while before it
 * counts (`forMs`), and once announced it stays quiet for a cooldown. Recovery is
 * only announced for a problem that was actually announced — the same rule the
 * link callouts in the sibling project needed after crying wolf once.
 *
 * All pure: the decision, the wording and the request body. The sending lives in
 * AlertService.
 */

export type AlertKind = 'sensor' | 'device' | 'usage' | 'health';

export interface AlertRule {
  /** Stable id, so state survives config edits. */
  id: string;
  kind: AlertKind;
  /** What is being watched: a reading key, a device id, 'usage', 'undervoltage'… */
  target: string;
  /** Human name for the message. */
  label: string;
  /** For sensor rules: fire when the value goes below / above this. */
  below?: number | null;
  above?: number | null;
  /** How long the condition must hold before it is worth a message. */
  forMs: number;
}

export interface AlertState {
  /** Since when the condition has been continuously true, or null. */
  since: number | null;
  /** When it was last announced. */
  firedAt: number | null;
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  /** ntfy priority: 'default' for recovery, 'high' for a problem. */
  priority: 'default' | 'high';
  tags: string[];
}

export const ALERT_COOLDOWN_MS = 6 * 3_600_000;

/**
 * Decide, for one rule, from "is the condition true right now" plus how long it
 * has been true. Returns the message to send, or null for silence.
 */
export function evaluateRule(
  rule: AlertRule,
  breached: boolean,
  detail: string,
  prev: AlertState,
  now: number,
  cooldownMs = ALERT_COOLDOWN_MS,
): { next: AlertState; alert: Alert | null } {
  if (!breached) {
    // Recovery is only worth saying for a problem that was announced.
    const alert: Alert | null = prev.firedAt
      ? {
          id: rule.id,
          title: `${rule.label} is back to normal`,
          message: detail,
          priority: 'default',
          tags: ['white_check_mark'],
        }
      : null;
    return { next: { since: null, firedAt: null }, alert };
  }

  const since = prev.since ?? now;
  if (now - since < rule.forMs) return { next: { ...prev, since }, alert: null };
  if (prev.firedAt && now - prev.firedAt < cooldownMs) return { next: { ...prev, since }, alert: null };

  return {
    next: { since, firedAt: now },
    alert: {
      id: rule.id,
      title: `${rule.label}`,
      message: detail,
      priority: 'high',
      tags: [rule.kind === 'device' ? 'satellite' : rule.kind === 'usage' ? 'signal_strength' : 'warning'],
    },
  };
}

/** Is a sensor reading outside its rule? Missing readings are not breaches. */
export function sensorBreached(rule: AlertRule, value: number | null | undefined): { breached: boolean; detail: string } {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    // A sensor that is not connected is not an alarm — this box is meant to run
    // with whatever the operator happened to wire up.
    return { breached: false, detail: 'no reading' };
  }
  if (rule.below !== null && rule.below !== undefined && value < rule.below) {
    return { breached: true, detail: `${round(value)} is below ${rule.below}` };
  }
  if (rule.above !== null && rule.above !== undefined && value > rule.above) {
    return { breached: true, detail: `${round(value)} is above ${rule.above}` };
  }
  return { breached: false, detail: `${round(value)} is fine` };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

export interface NtfyConfig {
  /** Full topic URL, e.g. https://ntfy.sh/my-secret-topic */
  url: string;
  /** Optional bearer token for a private server. */
  token?: string | null;
}

/** A topic URL we are willing to POST to. */
export function isNtfyUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\/[^\s]+\/[^\s]+$/.test(v.trim());
}

/**
 * The HTTP request that delivers one alert. ntfy takes the body as the message and
 * everything else as headers, which is why this is a plain POST with no JSON: it
 * works from `curl`, from here, and from a box with a barely-working uplink.
 */
export function ntfyRequest(cfg: NtfyConfig, alert: Alert, site: string): {
  url: string;
  headers: Record<string, string>;
  body: string;
} {
  return {
    url: cfg.url.trim(),
    headers: {
      Title: `${site}: ${alert.title}`,
      Priority: alert.priority === 'high' ? 'high' : 'default',
      Tags: alert.tags.join(','),
      ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      'Content-Type': 'text/plain; charset=utf-8',
    },
    body: alert.message,
  };
}

/** Default rules for a new box: the two things that are always worth knowing. */
export function defaultRules(): AlertRule[] {
  return [
    {
      id: 'health:undervoltage',
      kind: 'health',
      target: 'undervoltage',
      label: 'Supply voltage sagging',
      forMs: 5 * 60_000,
    },
    {
      // A sealed box in the sun is the normal case here, and a thermal clamp looks
      // exactly like a sagging supply from the outside — slow and flaky.
      id: 'health:thermal',
      kind: 'health',
      target: 'thermal',
      label: 'Pi throttling from heat',
      forMs: 5 * 60_000,
    },
    {
      id: 'usage:cap',
      kind: 'usage',
      target: 'usage',
      label: 'Mobile data allowance',
      forMs: 60_000,
    },
  ];
}

/**
 * The topic URL is the credential.
 *
 * ntfy has no accounts on the public server: whoever knows the topic can read every
 * alert this site sends *and* post fake ones — which is why the setup page tells the
 * operator to pick something unguessable. Handing it out over an unauthenticated GET
 * would have made that advice pointless, so the status endpoint shows only enough to
 * recognise which topic is configured.
 */
export function maskNtfyUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/^(https?:\/\/[^/]+\/)(.+)$/);
  if (!m) return '(stored)';
  const topic = m[2];
  const head = topic.slice(0, 2);
  const tail = topic.length > 6 ? topic.slice(-3) : '';
  return `${m[1]}${head}…${tail}`;
}

/** The masked URL comes back unchanged when the operator did not retype it. */
export function unmaskNtfyUrl(incoming: string | null, stored: string | null): string | null {
  if (incoming !== null && incoming === maskNtfyUrl(stored)) return stored;
  return incoming;
}
