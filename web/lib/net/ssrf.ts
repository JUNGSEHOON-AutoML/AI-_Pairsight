// Outbound fetch guard for user-supplied URLs (architecture.md, "URL 가져오기 보안").
// The IP check runs inside the socket's DNS lookup, i.e. at connect time, so a hostname that
// resolves to a public IP during a pre-check and a private one at connect time (DNS rebinding) is still refused.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { Agent } from "undici";

const blocked = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4],
] as const) blocked.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) blocked.addSubnet(net, bits, "ipv6");

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return false;
  if (family === 6) {
    const mapped = ip.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPublicAddress(mapped[1]);
    return !blocked.check(ip, "ipv6");
  }
  return !blocked.check(ip, "ipv4");
}

export class BlockedUrlError extends Error {}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

function guardedLookup(hostname: string, options: object, cb: LookupCb) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, "", 0);
    const list = addresses as LookupAddress[];
    const bad = list.find((a) => !isPublicAddress(a.address));
    if (bad || list.length === 0) {
      const e = new BlockedUrlError(`blocked address for ${hostname}`) as NodeJS.ErrnoException;
      e.code = "EBLOCKED";
      return cb(e, "", 0);
    }
    const wantsAll = (options as { all?: boolean }).all;
    if (wantsAll) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

export const guardedAgent = new Agent({
  connect: { lookup: guardedLookup as never, timeout: 10_000 },
  headersTimeout: 10_000,
  bodyTimeout: 10_000,
});

export function assertFetchableUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedUrlError("not a URL");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new BlockedUrlError("only http(s)");
  if (u.username || u.password) throw new BlockedUrlError("credentials in URL");
  if (u.port && u.port !== "80" && u.port !== "443") throw new BlockedUrlError("only ports 80 and 443");
  // Literal IPs are checked here too (they skip DNS lookup).
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) throw new BlockedUrlError("private address");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new BlockedUrlError("local hostname");
  }
  return u;
}
