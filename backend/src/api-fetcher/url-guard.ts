import dns from 'node:dns'
import net from 'node:net'
import { FetchError } from './errors.js'

export interface NetworkPolicy {
  allowPrivateNetwork: boolean
}

export function getNetworkPolicy(): NetworkPolicy {
  const flag = process.env.API_FETCHER_ALLOW_PRIVATE_NETWORK
  if (flag === 'true' || flag === '1') return { allowPrivateNetwork: true }
  if (flag === 'false' || flag === '0') return { allowPrivateNetwork: false }
  return { allowPrivateNetwork: process.env.NODE_ENV !== 'production' }
}

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, part) => acc * 256 + parseInt(part, 10), 0)
}

function inCidr4(ip: string, base: string, bits: number): boolean {
  const size = 2 ** (32 - bits)
  const start = Math.floor(ipv4ToInt(base) / size) * size
  const n = ipv4ToInt(ip)
  return n >= start && n < start + size
}

function expandIpv6(ip: string): number[] | null {
  let addr = ip.split('%')[0].toLowerCase()
  const v4 = addr.match(/(\d+\.\d+\.\d+\.\d+)$/)
  if (v4) {
    const n = ipv4ToInt(v4[1])
    addr = addr.replace(v4[1], `${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`)
  }
  const halves = addr.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  if (fill < 0) return null
  const groups = [...head, ...Array(fill).fill('0'), ...tail].map((g) => parseInt(g || '0', 16))
  return groups.length === 8 && groups.every((g) => Number.isInteger(g)) ? groups : null
}

function embeddedIpv4(groups: number[]): string | null {
  const isMapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff
  const isCompat = groups.slice(0, 6).every((g) => g === 0) && (groups[6] !== 0 || groups[7] > 1)
  const isNat64 = groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)
  if (!isMapped && !isCompat && !isNat64) return null
  return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`
}

/** Addresses that are never reachable through the proxy, even in permissive mode (cloud metadata etc.). */
export function isAlwaysBlocked(ip: string): boolean {
  if (net.isIPv4(ip)) return inCidr4(ip, '169.254.0.0', 16) || ip === '100.100.100.200' || ip === '0.0.0.0'
  if (net.isIPv6(ip)) {
    const g = expandIpv6(ip)
    if (!g) return true
    const v4 = embeddedIpv4(g)
    if (v4) return isAlwaysBlocked(v4)
    if (g.every((x) => x === 0)) return true
    return g[0] === 0xfd00 && g[1] === 0x0ec2 // AWS IPv6 metadata range fd00:ec2::/32
  }
  return true
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return (
      inCidr4(ip, '0.0.0.0', 8) ||
      inCidr4(ip, '10.0.0.0', 8) ||
      inCidr4(ip, '100.64.0.0', 10) ||
      inCidr4(ip, '127.0.0.0', 8) ||
      inCidr4(ip, '169.254.0.0', 16) ||
      inCidr4(ip, '172.16.0.0', 12) ||
      inCidr4(ip, '192.0.0.0', 24) ||
      inCidr4(ip, '192.168.0.0', 16) ||
      inCidr4(ip, '198.18.0.0', 15) ||
      inCidr4(ip, '224.0.0.0', 3)
    )
  }
  if (net.isIPv6(ip)) {
    const g = expandIpv6(ip)
    if (!g) return true
    const v4 = embeddedIpv4(g)
    if (v4) return isPrivateAddress(v4)
    if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return true
    return (g[0] & 0xfe00) === 0xfc00 || (g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xff00) === 0xff00
  }
  return true
}

export function assertAddressAllowed(ip: string, policy: NetworkPolicy, hostLabel: string): void {
  if (isAlwaysBlocked(ip)) {
    throw new FetchError('BLOCKED_HOST', `Blocked address ${hostLabel}`, 'Link-local and cloud metadata addresses can never be reached through the proxy.')
  }
  if (!policy.allowPrivateNetwork && isPrivateAddress(ip)) {
    throw new FetchError('BLOCKED_HOST', `Blocked private address ${hostLabel}`, 'Private, loopback and internal network addresses are blocked in this deployment.')
  }
}

export interface ParsedTarget {
  url: URL
  notes: string[]
}

/** Parses and validates a user-supplied URL. Adds a scheme when it is missing and reports that as a note. */
export function parseTargetUrl(raw: string, policy: NetworkPolicy): ParsedTarget {
  const notes: string[] = []
  let text = raw.trim()
  if (!text) throw new FetchError('INVALID_URL', 'URL is empty')
  if (/\s/.test(text)) throw new FetchError('INVALID_URL', 'URL must not contain spaces', 'Encode spaces as %20.')

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^(localhost|[\d.]+|\[[\da-f:]+\])(:\d+)?([/?#]|$)/i.test(text)) {
      throw new FetchError('INVALID_URL', `Unsupported URL scheme in "${text.split(':')[0]}:"`, 'Only http:// and https:// URLs can be requested.')
    }
    const hostPart = text.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
    const local = hostPart === 'localhost' || net.isIP(hostPart) !== 0
    text = `${local ? 'http' : 'https'}://${text}`
    notes.push(`No scheme provided; assumed ${local ? 'http' : 'https'}://`)
  }

  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new FetchError('INVALID_URL', 'URL is not valid', 'The address could not be parsed. Check the host, port and path.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('INVALID_URL', `Unsupported protocol ${url.protocol}`, 'Only http:// and https:// URLs can be requested.')
  }
  if (url.username || url.password) {
    throw new FetchError('INVALID_URL', 'Credentials in the URL are not allowed', 'Use the Authorization tab (Basic Auth) instead of user:password@host so secrets do not leak into logs and history.')
  }
  if (!url.hostname) throw new FetchError('INVALID_URL', 'URL has no host')

  const bareHost = url.hostname.replace(/^\[|\]$/g, '')
  if (bareHost.toLowerCase() === 'metadata.google.internal') {
    throw new FetchError('BLOCKED_HOST', 'Blocked cloud metadata host', 'Metadata endpoints can never be reached through the proxy.')
  }
  if (net.isIP(bareHost)) assertAddressAllowed(bareHost, policy, bareHost)
  else if (!policy.allowPrivateNetwork && /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(bareHost)) {
    throw new FetchError('BLOCKED_HOST', `Blocked internal hostname ${bareHost}`, 'Loopback and internal hostnames are blocked in this deployment.')
  }
  return { url, notes }
}

/**
 * DNS lookup used by the socket. Validating here (rather than only before connecting) closes the DNS-rebinding gap,
 * because the address that is validated is exactly the address that is connected to.
 */
export function createGuardedLookup(policy: NetworkPolicy) {
  return (hostname: string, options: dns.LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => {
    dns.lookup(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err, '' as string, 4)
      try {
        const allowed = (addresses as dns.LookupAddress[]).filter((a) => {
          try {
            assertAddressAllowed(a.address, policy, `${hostname} (${a.address})`)
            return true
          } catch {
            return false
          }
        })
        if (allowed.length === 0) {
          assertAddressAllowed((addresses as dns.LookupAddress[])[0].address, policy, `${hostname} (${(addresses as dns.LookupAddress[])[0].address})`)
        }
        if (options.all) return callback(null, allowed)
        return callback(null, allowed[0].address, allowed[0].family)
      } catch (e) {
        return callback(e as NodeJS.ErrnoException, '' as string, 4)
      }
    })
  }
}
