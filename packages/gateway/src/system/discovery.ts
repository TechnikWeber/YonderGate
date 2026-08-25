/**
 * Finding the devices on site.
 *
 * The gateway is the only thing at the plot with a keyboard-shaped hole in it, so
 * "what else is on this network, and how do I open it" has to be answerable from a
 * page. Two sources, deliberately kept apart:
 *
 *  - **passive**: the kernel's neighbour table (`ip neigh`) — instant, free, and it
 *    already knows everything that has spoken recently.
 *  - **active**: a ping sweep of the subnet, which finds the quiet ones at the cost
 *    of a few seconds and one packet per host.
 *
 * Everything here is pure: parsing, subnet maths, vendor lookup and merging. The
 * shelling out and the socket probing live in RealSystem, so all of this is tested
 * without a network.
 */

export interface Subnet {
  iface: string;
  /** Address of the gateway itself on this network. */
  address: string;
  cidr: string;
  prefix: number;
}

/**
 * Interfaces that are never a network to advertise or sweep: the loopback, and the
 * VPN itself — advertising the tailnet's own address back into the tailnet is a
 * routing loop, not a subnet route.
 */
const SKIP_IFACES = [/^lo$/, /^tailscale\d*$/, /^wg\d*$/, /^zt/];

/** `ip -o -f inet addr show` → the networks this box sits on. */
export function parseSubnets(out: string): Subnet[] {
  const subnets: Subnet[] = [];
  for (const line of (out ?? '').split('\n')) {
    const m = line.match(/^\d+:\s+(\S+)\s+inet\s+(\d+\.\d+\.\d+\.\d+)\/(\d+)/);
    if (!m) continue;
    const [, iface, address, prefixRaw] = m;
    if (SKIP_IFACES.some((re) => re.test(iface))) continue;
    const prefix = Number(prefixRaw);
    subnets.push({ iface, address, prefix, cidr: `${networkAddress(address, prefix)}/${prefix}` });
  }
  return subnets;
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

function intToIp(n: number): string {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
}

export function networkAddress(ip: string, prefix: number): string {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return intToIp(ipToInt(ip) & mask);
}

/**
 * Networks worth offering as subnet routes. A /32 is a single address — usually a
 * VPN or a point-to-point link — and advertising it as a route to "a network" is
 * meaningless, so it is filtered rather than shown as a choice that cannot work.
 */
export function routableSubnets(subnets: Subnet[]): Subnet[] {
  return subnets.filter((n) => n.prefix < 31);
}

/**
 * Every host address in a subnet, for an active sweep. Capped on purpose: a /16 is
 * 65k pings, which is not a "scan" but a nuisance — anything wider than /22 is
 * refused rather than silently truncated, so the UI can say why.
 */
export function sweepTargets(subnet: Subnet, maxPrefix = 22): { targets: string[]; skipped: string | null } {
  if (subnet.prefix < maxPrefix) {
    return { targets: [], skipped: `${subnet.cidr} is too large to sweep (wider than /${maxPrefix})` };
  }
  const net = ipToInt(networkAddress(subnet.address, subnet.prefix));
  const size = 2 ** (32 - subnet.prefix);
  const targets: string[] = [];
  // Skip the network address itself and, for /31 and wider, the broadcast address.
  for (let i = 1; i < size - (subnet.prefix <= 30 ? 1 : 0); i++) {
    const ip = intToIp(net + i);
    if (ip !== subnet.address) targets.push(ip);
  }
  return { targets, skipped: null };
}

export interface Neighbour {
  ip: string;
  mac: string | null;
  iface: string;
  /** The kernel's own view: REACHABLE, STALE, FAILED… */
  state: string;
}

/**
 * `ip neigh` — one line per neighbour:
 *   `192.168.4.23 dev wlan0 lladdr b8:27:eb:11:22:33 REACHABLE`
 * FAILED and INCOMPLETE entries are dropped: they are the kernel remembering that
 * something did NOT answer, which is the opposite of a discovered device.
 */
export function parseIpNeigh(out: string): Neighbour[] {
  const found: Neighbour[] = [];
  for (const line of (out ?? '').split('\n')) {
    const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s+dev\s+(\S+)(?:.*?lladdr\s+([0-9a-fA-F:]{17}))?\s*(\w+)?\s*$/);
    if (!m) continue;
    const [, ip, iface, mac, state] = m;
    const st = (state ?? '').toUpperCase();
    if (st === 'FAILED' || st === 'INCOMPLETE') continue;
    found.push({ ip, mac: mac ? mac.toLowerCase() : null, iface, state: st || 'UNKNOWN' });
  }
  return found;
}

/**
 * MAC prefix → who made it. Deliberately short: the point is to recognise the
 * things that turn up at a site like this — the router, the cameras, the sensors —
 * not to ship an OUI database. An unknown prefix says "unknown", never a guess.
 */
const OUI: Record<string, string> = {
  'b8:27:eb': 'Raspberry Pi',
  'dc:a6:32': 'Raspberry Pi',
  'e4:5f:01': 'Raspberry Pi',
  '28:cd:c1': 'Raspberry Pi',
  '3c:a6:2f': 'AVM (FritzBox)',
  '38:10:d5': 'AVM (FritzBox)',
  'c8:0e:14': 'AVM (FritzBox)',
  '00:1e:10': 'Huawei',
  '00:e0:4c': 'Realtek',
  '00:12:12': 'Hikvision',
  '4c:11:bf': 'Dahua',
  'ec:71:db': 'Reolink',
  '74:ac:b9': 'Ubiquiti',
  'b4:fb:e4': 'Ubiquiti',
  '50:c7:bf': 'TP-Link',
  '98:da:c4': 'Shelly',
  '24:6f:28': 'Espressif (ESP32)',
  '30:ae:a4': 'Espressif (ESP32)',
  'ac:0b:fb': 'Espressif (ESP32)',
};

export function macVendor(mac: string | null): string | null {
  if (!mac) return null;
  return OUI[mac.slice(0, 8).toLowerCase()] ?? null;
}

/** Ports worth knowing about, because they decide what we can offer to open. */
export const PROBE_PORTS = [80, 443, 8080, 8443, 554, 22];

export interface Device {
  ip: string;
  mac: string | null;
  iface: string;
  vendor: string | null;
  /** Reverse-DNS or mDNS name, when there is one. */
  hostname: string | null;
  /** Which of PROBE_PORTS answered. */
  openPorts: number[];
  /** True for the gateway's own address. */
  self: boolean;
}

/** The URL to offer for a device, or null when nothing web-shaped answered. */
export function deviceUrl(d: Pick<Device, 'ip' | 'openPorts'>): string | null {
  if (d.openPorts.includes(80)) return `http://${d.ip}/`;
  if (d.openPorts.includes(8080)) return `http://${d.ip}:8080/`;
  if (d.openPorts.includes(443)) return `https://${d.ip}/`;
  if (d.openPorts.includes(8443)) return `https://${d.ip}:8443/`;
  return null;
}

/**
 * A one-line guess at what a device is, from the ports it answers on and who made
 * it. Phrased as a guess ("looks like…") because it is one — an RTSP port is a
 * strong hint at a camera, not proof.
 */
export function describeDevice(d: Device): string {
  const bits: string[] = [];
  if (d.self) bits.push('this gateway');
  if (d.openPorts.includes(554)) bits.push('looks like a camera (RTSP)');
  else if (d.openPorts.some((p) => [80, 443, 8080, 8443].includes(p))) bits.push('has a web interface');
  if (d.openPorts.includes(22)) bits.push('SSH');
  if (!bits.length) bits.push(d.mac ? 'answered, no open ports we probe' : 'seen on the network');
  return bits.join(' · ');
}

/**
 * A device the gateway remembers. Keyed by **MAC where there is one**: addresses come
 * from DHCP and move, while the hardware behind them does not — a camera that comes
 * back on a different address is still the camera you named.
 *
 * An empty `label` means "seen once, never named". Those are remembered too, because
 * "when did this last answer?" is a question about every device on the site, not only
 * the ones worth naming — but they are the ones `capSeen` evicts when the list grows.
 */
export interface KnownDevice {
  id: string;
  label: string;
  mac: string | null;
  /** Last address it was seen at, so it can be found again before a scan. */
  ip: string;
  /** Which port its web UI is on — not everything is 80. */
  port: number;
  /** ISO timestamp of the last scan that saw it. */
  lastSeen: string | null;
}

/** MAC if we have one, address otherwise. See KnownDevice. */
export function deviceKey(d: { mac: string | null; ip: string }): string {
  return d.mac ? `mac:${d.mac.toLowerCase()}` : `ip:${d.ip}`;
}

/**
 * Fold what the operator saved into what the scan found, and keep the ones that did
 * NOT answer. On a site you cannot walk to, "the camera I named is not answering"
 * is the single most useful thing this page can tell you — dropping it from the
 * list would hide exactly that.
 */
export interface ScannedDevice extends Device {
  /** The name the operator gave it, when they gave one. */
  label: string | null;
  /** Web port to use for links and publishing. */
  port: number;
  known: boolean;
  /** Did it answer in THIS scan? */
  seen: boolean;
  lastSeen: string | null;
}

export function mergeKnown(found: Device[], known: KnownDevice[], now = new Date().toISOString()): ScannedDevice[] {
  const byKey = new Map(known.map((k) => [k.id, k]));
  const out: ScannedDevice[] = found.map((d) => {
    const k = byKey.get(deviceKey(d));
    if (k) byKey.delete(k.id);
    return {
      ...d,
      label: k?.label || null,
      port: k?.port ?? 80,
      // "Saved" is about the operator having named it, not about us remembering it.
      known: !!(k && k.label),
      seen: true,
      lastSeen: now,
    };
  });
  // Whatever is left did not answer this time. A named device belongs in the list —
  // "the camera I named is silent" is the point of naming it. One we merely remember
  // does not: an unnamed absence is a phone that left, not news.
  for (const k of byKey.values()) {
    if (!k.label) continue;
    out.push({
      ip: k.ip,
      mac: k.mac,
      iface: '',
      vendor: macVendor(k.mac),
      hostname: null,
      openPorts: [],
      self: false,
      label: k.label,
      port: k.port,
      known: true,
      seen: false,
      lastSeen: k.lastSeen,
    });
  }
  return out;
}

/**
 * How many merely-seen devices to keep. Named ones are never counted or evicted; this
 * is only about the phones and laptops that pass through, which would otherwise grow
 * the config file forever on a site with visitors.
 */
export const SEEN_LIMIT = 64;

/**
 * Fold a scan into the remembered list: known devices get their address and last-seen
 * moved on, and anything new is remembered with a timestamp and no name. That is what
 * makes "last seen" answerable for a device nobody bothered to name — and it only ever
 * happens when someone asks for a scan, never in the background.
 */
export function rememberSeen(
  known: KnownDevice[],
  found: Device[],
  now = new Date().toISOString(),
  limit = SEEN_LIMIT,
): KnownDevice[] {
  const byId = new Map(known.map((k) => [k.id, k]));
  for (const d of found) {
    if (d.self) continue; // the gateway is not a discovery
    const id = deviceKey(d);
    const prev = byId.get(id);
    byId.set(id, {
      id,
      label: prev?.label ?? '',
      mac: d.mac ?? prev?.mac ?? null,
      ip: d.ip,
      port: prev?.port ?? 80,
      lastSeen: now,
    });
  }
  return capSeen([...byId.values()], limit);
}

/** Keep every named device, and only the most recently seen `limit` unnamed ones. */
export function capSeen(devices: KnownDevice[], limit = SEEN_LIMIT): KnownDevice[] {
  const named = devices.filter((d) => d.label);
  const seen = devices
    .filter((d) => !d.label)
    .sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''))
    .slice(0, limit);
  return [...named, ...seen];
}

/** Mark one device as answering right now — what the per-device "Check" button does. */
export function markSeen(known: KnownDevice[], id: string, now = new Date().toISOString()): KnownDevice[] {
  return known.map((k) => (k.id === id ? { ...k, lastSeen: now } : k));
}

/** Fold a scan back into the saved list: addresses and last-seen move on. */
export function updateKnown(known: KnownDevice[], found: Device[], now = new Date().toISOString()): KnownDevice[] {
  const seen = new Map(found.map((d) => [deviceKey(d), d]));
  return known.map((k) => {
    const d = seen.get(k.id);
    return d ? { ...k, ip: d.ip, mac: d.mac ?? k.mac, lastSeen: now } : k;
  });
}

/** Merge neighbour entries into devices, newest information winning. */
export function mergeDevices(
  neighbours: Neighbour[],
  extra: { selfAddresses: string[]; hostnames?: Record<string, string | null>; ports?: Record<string, number[]> },
): Device[] {
  const byIp = new Map<string, Device>();
  for (const n of neighbours) {
    byIp.set(n.ip, {
      ip: n.ip,
      mac: n.mac,
      iface: n.iface,
      vendor: macVendor(n.mac),
      hostname: extra.hostnames?.[n.ip] ?? null,
      openPorts: extra.ports?.[n.ip] ?? [],
      self: extra.selfAddresses.includes(n.ip),
    });
  }
  return [...byIp.values()].sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip));
}
