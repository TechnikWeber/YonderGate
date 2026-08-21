import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { secretOk } from './auth.js';

/**
 * Passes a device's own web UI through the gateway.
 *
 * The things at the site — the LTE stick on its 192.168.8.0/24, a camera on the
 * gateway's AP, the router upstream — are reachable from the Pi and from nowhere
 * else. This makes any one of them reachable from wherever you already are: the
 * AP, the LAN, or the VPN. (Tailscale subnet routes are the better answer when you
 * can use them; this is what works without touching the tailnet's routing.)
 *
 * Each device gets its OWN port and is proxied from the root, rather than living
 * under a path on the setup server: device UIs are full of absolute paths
 * (`/api/…`, `/html/…`) and rewriting them is a losing game, while a dedicated
 * origin also keeps their session cookies working exactly as they expect.
 *
 * When an API secret is configured it guards these ports too — otherwise the
 * gateway would hand a device's admin UI to anyone who can reach it.
 */

const COOKIE = 'ygw_proxy';

/** Value of one cookie from a request's Cookie header. */
export function cookieValue(header: string | undefined, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

export type ProxyAuth = 'ok' | 'set-cookie' | 'denied';

/**
 * Decide access for one request. Pure so the gate is testable: no secret means open
 * (same rule as the rest of the setup API), a matching `?secret=` earns a cookie so
 * the UI's own XHRs get through, and anything else is refused.
 */
export function proxyAuth(secret: string | null, query: string | null, cookieHeader: string | undefined): ProxyAuth {
  if (!secret) return 'ok';
  if (query != null && secretOk(secret, query)) return 'set-cookie';
  if (secretOk(secret, cookieValue(cookieHeader, COOKIE))) return 'ok';
  return 'denied';
}

export interface DeviceProxyHandle {
  port: number;
  close(): void;
}

export function startDeviceProxy(opts: {
  port: number;
  host: string;
  /** API secret, or null when the gateway runs without one. */
  secret: string | null;
  /** The device's HTTP port. */
  targetPort?: number;
  bindHost?: string;
  log?: (msg: string) => void;
}): DeviceProxyHandle {
  const log = opts.log ?? (() => {});
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${opts.host}`);
    const auth = proxyAuth(opts.secret, url.searchParams.get('secret'), req.headers.cookie);

    if (auth === 'denied') {
      res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('This gateway has an API secret. Open this page once as  …/?secret=YOUR_SECRET\n');
      return;
    }
    if (auth === 'set-cookie') {
      // Trade the query parameter for a cookie so the stick's own XHRs are covered,
      // and drop the secret out of the address bar.
      const granted = url.searchParams.get('secret') ?? '';
      url.searchParams.delete('secret');
      res.writeHead(302, {
        'set-cookie': `${COOKIE}=${encodeURIComponent(granted)}; Path=/; HttpOnly; SameSite=Lax`,
        location: `${url.pathname}${url.search}`,
      });
      res.end();
      return;
    }

    // Forward as-is. The Host header is rewritten (the stick checks it) and our own
    // cookie is stripped so the stick never sees it.
    const headers: Record<string, string | string[]> = { ...req.headers } as Record<string, string | string[]>;
    headers.host = opts.host;
    if (typeof headers.cookie === 'string') {
      const kept = headers.cookie
        .split(';')
        .filter((c) => c.trim().split('=')[0] !== COOKIE)
        .join(';')
        .trim();
      if (kept) headers.cookie = kept;
      else delete headers.cookie;
    }

    const upstream = request(
      { host: opts.host, port: opts.targetPort ?? 80, method: req.method, path: req.url, headers, timeout: 8000 },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
    upstream.on('error', (err) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(
        `Could not reach ${opts.host} from the gateway: ${(err as Error).message}\n` +
          'Is it powered on, and does `ip route get ' + opts.host + '` show an interface?\n',
      );
    });
    req.pipe(upstream);
  });

  server.on('error', (err) => log(`[proxy] not started (${(err as NodeJS.ErrnoException).code ?? err.message})`));
  server.listen(opts.port, opts.bindHost ?? '0.0.0.0', () =>
    log(`[proxy] :${opts.port} → http://${opts.host}:${opts.targetPort ?? 80}/`),
  );

  return {
    port: opts.port,
    close() {
      server.close();
    },
  };
}

/** One device published on a local port. Persisted, so it survives a restart. */
export interface ProxyCfg {
  /** Stable id, derived from the target — one entry per host:port. */
  id: string;
  label: string;
  host: string;
  /** The device's own HTTP port. */
  port: number;
  /** The port the gateway publishes it on. */
  listen: number;
}

export const PROXY_PORT_BASE = 8100;

export function proxyId(host: string, port: number): string {
  return `${host}:${port}`;
}

/**
 * The next free port to publish a device on. Deliberately deterministic and
 * low-drama: start above the base and take the first one nobody else claimed —
 * including the gateway's own port, which taking would cut the operator off.
 */
export function nextListenPort(taken: number[], base = PROXY_PORT_BASE): number {
  let port = base;
  const used = new Set(taken);
  while (used.has(port)) port += 1;
  return port;
}

export interface ProxyProblem {
  message: string;
}

/** Reject what would not work, with the reason, before anything is started. */
export function validateProxy(cfg: ProxyCfg, reserved: number[]): ProxyProblem | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(cfg.host)) return { message: `"${cfg.host}" is not an IPv4 address.` };
  if (!Number.isInteger(cfg.port) || cfg.port < 1 || cfg.port > 65535) return { message: `Port ${cfg.port} is out of range.` };
  if (!Number.isInteger(cfg.listen) || cfg.listen < 1024 || cfg.listen > 65535) {
    return { message: `Publish port ${cfg.listen} must be between 1024 and 65535.` };
  }
  if (reserved.includes(cfg.listen)) return { message: `Port ${cfg.listen} is already in use on this gateway.` };
  return null;
}
