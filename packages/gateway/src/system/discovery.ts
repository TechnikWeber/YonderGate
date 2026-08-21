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
