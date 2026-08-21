import type { IncomingMessage } from 'node:http';

/** Header the setup UI / ground send the shared secret in. */
export const SECRET_HEADER = 'x-yondergate-secret';

/**
 * Is a request allowed given the configured secret? Pure so it's unit-tested.
 * A null/empty configured secret means the feature is OFF → always allowed
 * (first-time connect/setup needs nothing). Otherwise the provided value must
 * match exactly.
 */
export function secretOk(configured: string | null | undefined, provided: string | null | undefined): boolean {
  if (!configured) return true;
  return typeof provided === 'string' && provided === configured;
}

/** Pull the secret from a request: `x-yondergate-secret` header or a `?secret=` query. */
export function readSecretFromReq(req: IncomingMessage): string | null {
  const h = req.headers[SECRET_HEADER];
  if (typeof h === 'string' && h) return h;
  return readSecretFromUrl(req.url);
}

/** Pull the `?secret=` query value from a request URL (used for the WebSocket). */
export function readSecretFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const q = url.indexOf('?');
  if (q < 0) return null;
  const params = new URLSearchParams(url.slice(q + 1));
  return params.get('secret');
}

/**
 * Where a browser request came FROM — the gap a shared secret does not close.
 *
 * The secret is off by default, and the gateway answers CORS preflights
 * permissively, so any page the operator happens to open in a browser on the site's
 * network can POST to it: reboot, a WiFi change, a factory reset — and, through the
 * device proxy, whatever the devices themselves accept. That last one is the sharp
 * end here: a relay is switched by a plain URL, so a page that only manages to make
 * the browser *fetch* something has already switched the power.
 *
 * Two signals separate the operator's own tools from a random web page:
 *
 *  - **`Sec-Fetch-Site`**, which browsers send on *every* request including the ones
 *    with no Origin at all — an `<img src>`, a `<script>`, a form. `cross-site`
 *    means a page somewhere else caused this, whatever it dressed the request up as.
 *  - **`Origin`**, for everything else: absent means it was not a browser (curl, a
 *    script, the tests); `file://` is the desktop shell; a private, loopback,
 *    `.local` or Tailscale address is something on this network; the gateway's own
 *    address is the page it served itself.
 *
 * Anything from the public internet is refused unless it presents the API secret,
 * which also defeats DNS rebinding: the attacking page keeps its own origin even
 * once its name resolves to 192.168.4.1.
 */
export function isLocalOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  const o = origin.trim();
  if (o === 'file://') return true;
  let host: string;
  try {
    // URL.hostname keeps the brackets around an IPv6 literal; nothing else does.
    host = new URL(o).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }
  if (!host) return false;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local')) return true;
  if (/^fe80:/.test(host) || /^f[cd][0-9a-f]{2}:/.test(host)) return true; // link-local / ULA
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 127 || a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT range — Tailscale lives here
  return false;
}

/** Same host as the request was addressed to — a page the gateway served itself. */
export function isSameOrigin(origin: string | undefined | null, host: string | undefined | null): boolean {
  if (!origin || !host) return false;
  try {
    const o = new URL(origin);
    // The Host header carries host[:port]; compare hosts, not ports, so a page on
    // one port of this box may talk to another.
    const hostName = host.toLowerCase().replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
    return hostName !== '' && o.hostname.toLowerCase().replace(/^\[|\]$/g, '') === hostName;
  } catch {
    return false;
  }
}

export interface RequestOrigin {
  origin?: string | undefined | null;
  /** `Sec-Fetch-Site`, sent by current browsers on every request. */
  secFetchSite?: string | undefined | null;
  /** The `Host` header the request was addressed to. */
  host?: string | undefined | null;
  /** A configured secret was presented and matched. */
  secretMatched?: boolean;
}

/** May this request act on the gateway or on a device behind it? */
export function originAllowed(r: RequestOrigin): boolean {
  if (r.secretMatched) return true;
  // Decisive when present: it covers the requests that carry no Origin at all,
  // which is exactly how a relay would be switched by an <img> tag.
  const site = (r.secFetchSite ?? '').toLowerCase();
  if (site === 'cross-site') return false;
  if (site === 'same-origin' || site === 'same-site' || site === 'none') return true;
  if (r.origin === undefined || r.origin === null || r.origin === '') return true;
  if (isSameOrigin(r.origin, r.host)) return true;
  return isLocalOrigin(r.origin);
}

/** First value of a possibly-repeated header. */
function firstHeader(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function requestOrigin(req: IncomingMessage, secretMatched: boolean): RequestOrigin {
  return {
    origin: firstHeader(req.headers.origin),
    secFetchSite: firstHeader(req.headers['sec-fetch-site']),
    host: firstHeader(req.headers.host),
    secretMatched,
  };
}
