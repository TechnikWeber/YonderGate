/**
 * Who gets to reach the internet through this box.
 *
 * The gateway NATs whatever hangs off it — the AP and, when LTE is the uplink, the
 * site's wired LAN. That is usually wanted. Sometimes it is not: a camera that phones
 * home, a plug that pulls firmware over a metered SIM, or simply a site network you
 * would rather keep off the internet entirely. Switching it off must NOT make those
 * devices unreachable, because reaching them is the point of the whole box.
 *
 * So the rule is written by DESTINATION, not by uplink interface:
 *
 *   forwarded, came from this interface, going somewhere private or to the tailnet
 *     → allowed
 *   forwarded, came from this interface, going anywhere else
 *     → rejected
 *
 * Two things fall out of that, both of which matter more than they look:
 *
 *  - **It survives an uplink change.** Naming the uplink (`-o eth0`) would need
 *    re-applying every time the box fails over between LTE and Ethernet; naming the
 *    destination does not.
 *  - **Everything local keeps working.** Tailscale traffic arrives on tailscale0 and
 *    is forwarded *to* the device (a different direction, untouched), the reply is a
 *    packet to 100.64/10 (allowed), the setup page and the device proxy are traffic
 *    *to* the gateway itself and never hit FORWARD at all.
 *
 * REJECT rather than DROP: a device that is told "no" gives up in milliseconds, while
 * one that is ignored retries for a minute and looks broken. Everything here is pure —
 * RealSystem just runs the argv arrays.
 */

/** Our own chain, so the rules can be flushed and rebuilt without touching FORWARD. */
export const PASSTHROUGH_CHAIN = 'YGW_NOINET';

/**
 * Destinations that stay reachable with internet switched off: the three private
 * blocks, the CGNAT range Tailscale uses, and link-local.
 */
export const LOCAL_DESTINATIONS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '169.254.0.0/16'];

/** Create the chain and hook it into FORWARD. Both are no-ops once they exist. */
export function ensureChainArgs(): { args: string[]; optional: boolean }[] {
  return [
    { args: ['-N', PASSTHROUGH_CHAIN], optional: true }, // "already exists" is fine
    // -C tests for the jump; only insert when it is missing, or a restart stacks them.
    { args: ['-C', 'FORWARD', '-j', PASSTHROUGH_CHAIN], optional: true },
  ];
}

/** Insert the jump — run only when the `-C` test above failed. */
export function linkChainArgs(): string[] {
  return ['-I', 'FORWARD', '1', '-j', PASSTHROUGH_CHAIN];
}

/**
 * The whole rule set for the interfaces whose internet is off. Flushing first makes
 * this idempotent: the same call applies a change, re-applies after a reboot, and
 * clears everything when the list is empty.
 */
export function passthroughRules(blocked: string[], macs: string[] = []): string[][] {
  const rules: string[][] = [['-F', PASSTHROUGH_CHAIN]];
  const block = (match: string[]) => {
    for (const dest of LOCAL_DESTINATIONS) {
      rules.push(['-A', PASSTHROUGH_CHAIN, ...match, '-d', dest, '-j', 'RETURN']);
    }
    rules.push(['-A', PASSTHROUGH_CHAIN, ...match, '-j', 'REJECT', '--reject-with', 'icmp-net-prohibited']);
  };
  for (const iface of blocked) {
    if (isInterfaceName(iface)) block(['-i', iface]);
  }
  // Per device, by MAC: it follows the thing across DHCP leases, which an address does
  // not. Only works while the device is on a segment this box serves — a MAC does not
  // survive a router in between, and the UI says so rather than failing quietly.
  for (const mac of macs) {
    if (isMac(mac)) block(['-m', 'mac', '--mac-source', mac.toLowerCase()]);
  }
  return rules;
}

/** MACs go into argv, so they are checked rather than trusted. */
export function isMac(v: string): boolean {
  return /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(String(v ?? ''));
}

/** Interface names are argv here, so they are checked rather than trusted. */
export function isInterfaceName(v: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9._-]{0,14}$/.test(String(v ?? ''));
}

/** Which interfaces are switched off, from the config — the order is the UI's. */
export function blockedInterfaces(cfg: InternetConfig, apIface: string): string[] {
  const out: string[] = [];
  if (cfg.ap === false) out.push(apIface);
  if (cfg.lan === false && isInterfaceName(cfg.lanIface)) out.push(cfg.lanIface);
  return [...new Set(out)];
}

export interface InternetConfig {
  /** Devices on the gateway's own access point may reach the internet. Default: yes. */
  ap: boolean;
  /** Devices on the wired site LAN may reach the internet. Default: yes. */
  lan: boolean;
  /** Which interface that LAN is. Only meaningful while it is NOT the uplink. */
  lanIface: string;
}

export const INTERNET_DEFAULTS: InternetConfig = { ap: true, lan: true, lanIface: 'eth0' };

/**
 * Switching the AP's internet off makes it an internet-less network — which is
 * exactly the case the captive portal exists for. Without this, a phone joins, gets
 * an address, resolves names, and then silently fails at every connection; with it,
 * it lands on the setup page and can see why.
 */
export function apSharesInternet(cfg: InternetConfig, hasUplink: boolean): boolean {
  return hasUplink && cfg.ap !== false;
}

/** One line for the operator, in both the real and the simulated path. */
export function describePassthrough(blocked: string[], macCount: number): string {
  const parts: string[] = [];
  if (blocked.length) parts.push(blocked.join(' and '));
  if (macCount) parts.push(`${macCount} device${macCount === 1 ? '' : 's'}`);
  return parts.length
    ? `No internet for ${parts.join(' and ')} — everything stays reachable from the tailnet and from here.`
    : 'Internet passed through everywhere.';
}
