/**
 * Switching things off and on from 200 km away.
 *
 * The failure this exists for: a camera or a router that has stopped responding
 * and would come back with a power cycle. Everything else in this box can only
 * report that — a switch is the one thing that can act on it.
 *
 * Two mechanisms, because sites differ:
 *
 *  - **HTTP switches** (Shelly, Tasmota, or any URL) — nothing to wire, and the
 *    switch sits next to the device it powers rather than next to the Pi.
 *  - **A relay on the Pi's GPIO** — no network in the loop, which matters when the
 *    thing you need to power-cycle is the network.
 *
 * The URLs are built here and tested here, because getting an "on" and an "off"
 * the wrong way round is the kind of mistake you discover from a distance.
 */

export type SwitchKind = 'shelly' | 'tasmota' | 'url' | 'gpio';

export interface PowerSwitch {
  id: string;
  label: string;
  kind: SwitchKind;
  /** Address for HTTP switches (host or IP). */
  host?: string | null;
  /** Relay/channel index on a multi-channel switch. */
  channel?: number;
  /** BCM pin for a GPIO relay. */
  pin?: number;
  /** Many relay boards switch on a LOW level. */
  inverted?: boolean;
  /** Custom URLs — `{state}` is replaced by on/off. */
  onUrl?: string | null;
  offUrl?: string | null;
  /** Seconds the power stays off during a cycle. */
  cycleSeconds: number;
  /**
   * Device this switch powers. When that device stops answering, the gateway may
   * power-cycle it once — which is the whole point of having a switch at a site
   * nobody can visit.
   */
  deviceId?: string | null;
  autoCycle?: boolean;
}

export const SWITCH_DEFAULT_CYCLE_S = 8;

/** URL for one action on an HTTP switch, or null when the switch is a GPIO relay. */
export function switchUrl(sw: PowerSwitch, on: boolean): string | null {
  const ch = sw.channel ?? 0;
  switch (sw.kind) {
    case 'shelly':
      // Gen1 and Gen2 Shellys both answer this; Gen2 also accepts /rpc/Switch.Set.
      return sw.host ? `http://${sw.host}/relay/${ch}?turn=${on ? 'on' : 'off'}` : null;
    case 'tasmota':
      return sw.host ? `http://${sw.host}/cm?cmnd=Power${ch + 1}%20${on ? 'On' : 'Off'}` : null;
    case 'url': {
      const template = on ? sw.onUrl : sw.offUrl;
      return template ? template.replace('{state}', on ? 'on' : 'off') : null;
    }
    default:
      return null;
  }
}

/**
 * `gpioset` arguments for a relay. Written as a one-shot with a hold time so the
 * pin does not fall back the moment the process exits — a relay that resets when
 * the command returns would switch nothing.
 */
export function gpioArgs(sw: PowerSwitch, on: boolean, holdSeconds = 0): string[] {
  const level = sw.inverted ? (on ? 0 : 1) : on ? 1 : 0;
  const base = ['-c', '0'];
  if (holdSeconds > 0) base.push('-t', `${holdSeconds}s`);
  else base.push('-t', '0');
  return [...base, `${sw.pin ?? 0}=${level}`];
}

/** A switch we are willing to act on. */
export function validateSwitch(sw: Partial<PowerSwitch>): string | null {
  if (!sw.label || !String(sw.label).trim()) return 'Give the switch a name.';
  if (sw.channel !== undefined && (!Number.isInteger(sw.channel) || sw.channel < 0 || sw.channel > 7)) {
    return 'The channel is 0–7 (most plugs have exactly one, which is 0).';
  }
  if (sw.cycleSeconds !== undefined && (!Number.isFinite(sw.cycleSeconds) || sw.cycleSeconds < 1 || sw.cycleSeconds > 300)) {
    return 'The off-time is between 1 and 300 seconds.';
  }
  if (sw.kind === 'gpio') {
    const pin = Number(sw.pin);
    if (!Number.isInteger(pin) || pin < 0 || pin > 27) return 'A GPIO relay needs a BCM pin between 0 and 27.';
    return null;
  }
  if (sw.kind === 'url') {
    if (!sw.onUrl || !sw.offUrl) return 'A custom switch needs both an on and an off URL.';
    if (!/^https?:\/\//.test(sw.onUrl) || !/^https?:\/\//.test(sw.offUrl)) return 'The URLs must start with http:// or https://.';
    return null;
  }
  if (!sw.host || !/^[A-Za-z0-9._-]+$/.test(String(sw.host))) return 'A switch needs the address of the plug.';
  return null;
}

export function switchId(label: string): string {
  return `sw:${label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/**
 * Should the gateway power-cycle a device it cannot reach?
 *
 * Once, then wait. A device that does not come back is not helped by cycling it
 * every minute — and a switch that clacks all night on a flapping link is worse
 * than a device that is simply down, because it is also unrecoverable by hand.
 */
export const AUTO_CYCLE_COOLDOWN_MS = 60 * 60_000;

export function shouldAutoCycle(
  sw: PowerSwitch,
  deviceUnreachable: boolean,
  lastCycleAt: number | null,
  now: number,
  cooldownMs = AUTO_CYCLE_COOLDOWN_MS,
): boolean {
  if (!sw.autoCycle || !sw.deviceId) return false;
  if (!deviceUnreachable) return false;
  return lastCycleAt === null || now - lastCycleAt >= cooldownMs;
}
