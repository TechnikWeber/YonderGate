/**
 * Making the page cheap on a metered link.
 *
 * This gateway is reached over LTE, often on a tariff bought for alerts rather than
 * for browsing — a few hundred megabytes for the *lifetime* of the SIM is a normal
 * choice for a site like this. So the bytes the page costs are a feature, not an
 * afterthought, and they were measured rather than guessed:
 *
 *   /setup             120.7 kB  →  32.3 kB gzipped   (a 4× saving, once per visit)
 *   /api/health          1.6 kB  →   0.8 kB
 *   /api/system          0.4 kB  →   0.3 kB
 *
 * Two mechanisms, both plain HTTP so nothing on the client has to know about them:
 * compress what is worth compressing, and answer an unchanged page with a 304 so a
 * reload costs headers instead of 120 kB.
 *
 * Everything here is pure and unit-tested; the sending lives in the router.
 */

import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

/**
 * Below this, compression is noise: gzip's own framing plus a response that fits in
 * one segment either way. Above it, the saving is real — /api/health is 2× smaller.
 */
export const COMPRESS_MIN_BYTES = 512;

/**
 * Does the client accept gzip? Deliberately strict about `gzip;q=0` — a client that
 * says it does *not* want gzip must not be sent gzip, or the page breaks with no
 * error anyone can read from a phone at the site.
 */
export function acceptsGzip(header: string | string[] | undefined): boolean {
  const h = Array.isArray(header) ? header.join(',') : header;
  if (!h) return false;
  for (const part of h.toLowerCase().split(',')) {
    const [name, ...params] = part.trim().split(';');
    if (name !== 'gzip' && name !== '*') continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    if (q && Number(q.slice(2)) === 0) return false;
    return true;
  }
  return false;
}

/** Worth the CPU on a Zero 2 W? Size is the only thing that decides. */
export function worthCompressing(bytes: number): boolean {
  return bytes >= COMPRESS_MIN_BYTES;
}

/**
 * A weak validator over the content itself, not the file's mtime: `git pull` can
 * restore a byte-identical page with a new timestamp, and re-sending 120 kB over LTE
 * because a checkout touched a file is exactly the cost this is here to avoid.
 */
export function etagFor(body: string | Buffer): string {
  return `W/"${createHash('sha1').update(body).digest('base64url').slice(0, 22)}"`;
}

/** Does the client already hold this version? Handles the `If-None-Match` list form. */
export function etagMatches(ifNoneMatch: string | string[] | undefined, etag: string): boolean {
  const h = Array.isArray(ifNoneMatch) ? ifNoneMatch.join(',') : ifNoneMatch;
  if (!h) return false;
  return h.split(',').some((t) => t.trim() === etag || t.trim() === '*');
}

export interface EncodedBody {
  body: Buffer;
  headers: Record<string, string>;
}

/**
 * The body to actually send, with the headers that describe it. `vary` is not
 * optional politeness: a captive portal or a phone browser caching one encoding and
 * replaying it to a client that asked for the other is a page that never loads.
 */
export function encodeBody(text: string, contentType: string, acceptEncoding: string | string[] | undefined): EncodedBody {
  const raw = Buffer.from(text, 'utf8');
  const headers: Record<string, string> = { 'content-type': contentType, vary: 'accept-encoding' };
  if (worthCompressing(raw.length) && acceptsGzip(acceptEncoding)) {
    const gz = gzipSync(raw, { level: 6 });
    // Only if it actually helped — already-compressed content can grow.
    if (gz.length < raw.length) {
      return { body: gz, headers: { ...headers, 'content-encoding': 'gzip', 'content-length': String(gz.length) } };
    }
  }
  return { body: raw, headers: { ...headers, 'content-length': String(raw.length) } };
}
