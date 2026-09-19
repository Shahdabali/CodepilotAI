export type FetchErrorCode =
  | 'INVALID_URL'
  | 'BLOCKED_HOST'
  | 'UNRESOLVED_VARIABLES'
  | 'DNS_FAILED'
  | 'CONNECTION_REFUSED'
  | 'CONNECTION_RESET'
  | 'NETWORK_UNREACHABLE'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'TLS_ERROR'
  | 'TOO_MANY_REDIRECTS'
  | 'INVALID_REQUEST'
  | 'UNKNOWN'

export class FetchError extends Error {
  readonly fetchCode: FetchErrorCode
  readonly cause2?: string
  constructor(code: FetchErrorCode, message: string, cause?: string) {
    super(message)
    this.name = 'FetchError'
    this.fetchCode = code
    this.cause2 = cause
  }
}

export interface ErrorReport {
  code: FetchErrorCode
  message: string
  cause: string
  suggestions: string[]
  /** Which network stage failed, when it can be determined. */
  stage?: 'validation' | 'dns' | 'connect' | 'tls' | 'request' | 'response'
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_UNTRUSTED',
  'HOSTNAME_MISMATCH',
  'ERR_SSL_WRONG_VERSION_NUMBER',
  'EPROTO',
])

/** Maps any thrown error to a stable, user-facing error report. */
export function toErrorReport(err: unknown): ErrorReport {
  if (err instanceof FetchError) {
    switch (err.fetchCode) {
      case 'TIMEOUT':
        return {
          code: 'TIMEOUT',
          stage: 'response',
          message: err.message,
          cause: 'The server did not finish responding within the configured timeout.',
          suggestions: [
            'Increase the timeout in Settings > Defaults or the request settings.',
            'Check whether the API is slow or under load (try a lighter endpoint to compare).',
            'If the request works elsewhere, a firewall or VPN may be silently dropping packets.',
          ],
        }
      case 'CANCELLED':
        return { code: 'CANCELLED', message: 'Request cancelled', cause: 'The request was cancelled before it completed.', suggestions: [] }
      case 'INVALID_URL':
        return {
          code: 'INVALID_URL',
          stage: 'validation',
          message: err.message,
          cause: err.cause2 ?? 'The URL could not be parsed as a valid HTTP(S) address.',
          suggestions: ['Use a full URL such as https://api.example.com/users.', 'Check for spaces, missing slashes or unbalanced {{variables}}.'],
        }
      case 'BLOCKED_HOST':
        return {
          code: 'BLOCKED_HOST',
          stage: 'validation',
          message: err.message,
          cause: err.cause2 ?? 'The proxy refuses to connect to this address.',
          suggestions: [
            'Private, loopback and link-local addresses are blocked when the server runs in production mode.',
            'To test internal APIs on a trusted machine, set API_FETCHER_ALLOW_PRIVATE_NETWORK=true on the backend.',
            'Cloud metadata addresses (169.254.0.0/16) are always blocked.',
          ],
        }
      case 'UNRESOLVED_VARIABLES':
        return {
          code: 'UNRESOLVED_VARIABLES',
          stage: 'validation',
          message: err.message,
          cause: 'The request references variables that are not defined in the active environment.',
          suggestions: ['Select an environment that defines these variables, or add them under Environments.'],
        }
      case 'TOO_MANY_REDIRECTS':
        return {
          code: 'TOO_MANY_REDIRECTS',
          stage: 'response',
          message: err.message,
          cause: 'The server kept redirecting the request.',
          suggestions: ['Check for a redirect loop (for example http to https to http).', 'Disable "Follow redirects" to inspect the first redirect response.'],
        }
      default:
        return { code: err.fetchCode, message: err.message, cause: err.cause2 ?? err.message, suggestions: [] }
    }
  }

  const e = err as NodeJS.ErrnoException & { hostname?: string }
  const code = e?.code ?? ''
  const host = e?.hostname ? ` for ${e.hostname}` : ''

  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'EAI_NODATA' || code === 'EAI_FAIL') {
    return {
      code: 'DNS_FAILED',
      stage: 'dns',
      message: `DNS lookup failed${host}`,
      cause: code === 'EAI_AGAIN' ? 'The DNS server did not respond (temporary failure).' : 'The hostname does not resolve to an IP address.',
      suggestions: ['Check the hostname for typos.', 'Confirm the domain exists (nslookup / dig).', 'Check your DNS settings and network connection.'],
    }
  }
  if (code === 'ECONNREFUSED') {
    return {
      code: 'CONNECTION_REFUSED',
      stage: 'connect',
      message: 'Connection refused',
      cause: 'The host was reachable but nothing is listening on that port.',
      suggestions: ['Verify the port number.', 'Make sure the API server is running.', 'If the API runs in Docker, check that the port is published.'],
    }
  }
  if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'UND_ERR_SOCKET') {
    return {
      code: 'CONNECTION_RESET',
      stage: 'response',
      message: 'Connection was reset by the server',
      cause: 'The connection was closed before a complete response was received.',
      suggestions: ['The server may have crashed or rejected the request (payload too large, malformed body).', 'Try again; if it persists, check the server logs.'],
    }
  }
  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'ENETDOWN') {
    return {
      code: 'NETWORK_UNREACHABLE',
      stage: 'connect',
      message: 'Network unreachable',
      cause: 'There is no route to the destination host.',
      suggestions: ['Check your internet connection or VPN.', 'If the host is IPv6-only, make sure IPv6 is available on this machine.'],
    }
  }
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
    return {
      code: 'TIMEOUT',
      stage: 'connect',
      message: 'Connection timed out',
      cause: 'The TCP connection could not be established in time.',
      suggestions: ['The host may be down or blocking connections (firewall).', 'Verify the address and port.'],
    }
  }
  if (TLS_CODES.has(code) || code.startsWith('ERR_SSL') || code.startsWith('ERR_TLS')) {
    return {
      code: 'TLS_ERROR',
      stage: 'tls',
      message: `TLS error: ${code}`,
      cause: e.message || 'The TLS handshake failed.',
      suggestions: [
        'The certificate may be expired, self-signed, or issued for a different hostname.',
        'For a trusted development server you can disable certificate verification in the request settings (not for production APIs).',
        'If the URL is http:// on an https-only port (or the reverse), fix the scheme.',
      ],
    }
  }
  return {
    code: 'UNKNOWN',
    message: e?.message || 'Request failed',
    cause: code ? `Network error code ${code}` : 'An unexpected error occurred while sending the request.',
    suggestions: ['Try the request again.', 'Check the connectivity diagnostics tab for details.'],
  }
}
