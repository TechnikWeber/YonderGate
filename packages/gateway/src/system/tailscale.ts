/**
 * Pure parsing for `tailscale status --json`.
 *
 * The login URL matters most here. `tailscale up` blocks until the device is
 * authorised and only prints the URL once tailscaled has reached the control
 * plane — which is why waiting one second for it and scraping stdout produced
 * "Tailscale is starting" and no link, leaving the operator at `NeedsLogin` with
 * nothing to click. The daemon publishes the same URL as `AuthURL` in its status,
 * so that is what we read, and it stays readable for as long as the login is
 * pending (a page reload no longer loses it).
 */

export interface TailscaleStatusInfo {
  backendState: string;
  running: boolean;
  /** Pending login URL, or null when no login is in progress. */
  authUrl: string | null;
  /** The gateway's own IPv4 in the tailnet. */
  ip: string | null;
}

const EMPTY: TailscaleStatusInfo = { backendState: 'Unknown', running: false, authUrl: null, ip: null };

export function parseTailscaleStatus(json: string): TailscaleStatusInfo {
  try {
    const s = JSON.parse(json ?? '') as {
      BackendState?: string;
      AuthURL?: string;
      Self?: { TailscaleIPs?: string[] };
    };
    const backendState = s.BackendState ?? 'Unknown';
    const ip = (s.Self?.TailscaleIPs ?? []).find((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a)) ?? null;
    return {
      backendState,
      running: backendState === 'Running',
      authUrl: (s.AuthURL ?? '').trim() || null,
      ip,
    };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * Subnet routes: the native way to reach the site's devices.
 *
 * Advertising `192.168.4.0/24` from the gateway lets a laptop on the tailnet talk
 * to every device on that network **at its real address** — no per-device proxy, no
 * port juggling. Three things have to be true, and all three are easy to miss:
 * the routes must be advertised here, IP forwarding must be on, and the route has
 * to be **approved once in the tailnet admin console**. The UI says so, because a
 * silently unapproved route looks exactly like a broken network.
 */

/** `tailscale set --advertise-routes=…` — replaces the whole list, so pass all of it. */
export function advertiseRoutesArgs(cidrs: string[]): string[] {
  return ['set', `--advertise-routes=${cidrs.join(',')}`];
}

/** sysctl drop-in that turns the gateway into a router. */
export const FORWARDING_SYSCTL_PATH = '/etc/sysctl.d/99-yondergate-forwarding.conf';
export function forwardingSysctl(): string {
  return 'net.ipv4.ip_forward = 1\nnet.ipv6.conf.all.forwarding = 1\n';
}

/** Advertised routes from `tailscale debug prefs` (JSON). */
export function parseAdvertisedRoutes(json: string): string[] {
  try {
    const p = JSON.parse(json ?? '') as { AdvertiseRoutes?: string[] | null };
    return (p.AdvertiseRoutes ?? []).filter((r) => typeof r === 'string');
  } catch {
    return [];
  }
}

/**
 * Routes this node is actually serving, from `tailscale status --json`. A route
 * that is advertised but missing here is one nobody approved yet — the single most
 * common reason "subnet routing does not work".
 */
export function parseApprovedRoutes(json: string): string[] {
  try {
    const s = JSON.parse(json ?? '') as { Self?: { PrimaryRoutes?: string[] | null } };
    return (s.Self?.PrimaryRoutes ?? []).filter((r) => typeof r === 'string');
  } catch {
    return [];
  }
}

/** A CIDR we are willing to hand to `tailscale set` (IPv4, sane prefix). */
export function isCidr(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  const m = v.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/);
  if (!m) return false;
  const octets = [m[1], m[2], m[3], m[4]].map(Number);
  const prefix = Number(m[5]);
  return octets.every((o) => o <= 255) && prefix >= 8 && prefix <= 32;
}
