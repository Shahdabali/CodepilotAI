import type { RequestDef } from '../types'
import { statusText } from './format'

export interface StatusExplanation {
  title: string
  summary: string
  causes: string[]
  suggestions: string[]
  serverMessage?: string
}

interface Ctx {
  status: number
  statusText?: string
  request?: RequestDef | null
  responseHeaders: Array<[string, string]>
  bodyText?: string
}

const header = (headers: Array<[string, string]>, name: string) => headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1]

/** Pulls the human-readable message out of a typical JSON error body. */
export function extractServerMessage(body: string | undefined): string | undefined {
  if (!body) return undefined
  const t = body.trim()
  if (!t.startsWith('{') && !t.startsWith('[')) return t.length > 0 && t.length <= 240 && !t.startsWith('<') ? t : undefined
  try {
    const j = JSON.parse(t) as any
    const pick = (o: any): string | undefined => {
      if (!o || typeof o !== 'object') return typeof o === 'string' ? o : undefined
      for (const k of ['message', 'error_description', 'detail', 'error', 'title', 'reason', 'msg']) {
        const v = o[k]
        if (typeof v === 'string' && v) return v
        if (v && typeof v === 'object') {
          const nested = pick(v)
          if (nested) return nested
        }
      }
      if (Array.isArray(o.errors) && o.errors.length) {
        const first = o.errors[0]
        return typeof first === 'string' ? first : pick(first)
      }
      return undefined
    }
    const m = pick(j)
    return m && m.length <= 300 ? m : m?.slice(0, 300)
  } catch {
    return undefined
  }
}

export function explainStatus(ctx: Ctx): StatusExplanation | null {
  const { status } = ctx
  if (status < 300) return null
  const req = ctx.request
  const authType = req?.auth.type ?? 'none'
  const hasAuthHeader = !!req?.headers.some((h) => h.enabled && h.key.toLowerCase() === 'authorization' && h.value)
  const sentCredentials = authType !== 'none' || hasAuthHeader
  const title = `${status} ${statusText(status, ctx.statusText)}`.trim()
  const serverMessage = extractServerMessage(ctx.bodyText)
  const retryAfter = header(ctx.responseHeaders, 'retry-after')
  const wwwAuth = header(ctx.responseHeaders, 'www-authenticate')

  const base = (summary: string, causes: string[], suggestions: string[]): StatusExplanation => ({ title, summary, causes, suggestions, serverMessage })

  if (status >= 300 && status < 400) {
    const loc = header(ctx.responseHeaders, 'location')
    return base(
      `The server is redirecting this request${loc ? ` to ${loc}` : ''}.`,
      ['The resource moved, or the API forces a canonical URL (for example http to https or a trailing slash).'],
      ['Enable "Follow redirects" to reach the final response.', loc ? 'Update the request URL to the new location to avoid the extra hop.' : 'Check the Location header.']
    )
  }

  switch (status) {
    case 400:
      return base('The server could not understand the request because something in it is malformed or invalid.', ['Invalid or missing query parameters or body fields.', 'Malformed JSON or a wrong Content-Type.', 'A value has the wrong type or format (for example a string instead of a number).'], [
        serverMessage ? `Fix what the server reported: "${serverMessage}".` : 'Read the response body: APIs usually say which field is invalid.',
        'Validate the JSON body (Format button in the Body tab) and check the Content-Type header.',
        'Compare the request with the API documentation for required fields.',
      ])
    case 401: {
      const causes = sentCredentials
        ? ['The credentials were sent but rejected: wrong, expired or revoked token/key.', 'The token was issued for a different environment, audience or scope.']
        : ['No credentials were sent with this request, but the endpoint requires authentication.']
      if (wwwAuth) causes.push(`The server advertises: WWW-Authenticate: ${wwwAuth}`)
      return base('The API does not accept the identity presented, or none was presented.', causes, [
        sentCredentials ? 'Refresh or regenerate the token/key and update it in the Authorization tab or your environment.' : 'Open the Authorization tab and add a Bearer token, API key or Basic credentials.',
        authType === 'apikey' ? 'Check the API key name and whether it belongs in a header or the query string.' : 'Confirm the auth scheme (Bearer vs Basic vs API key) matches what the docs specify.',
        'Use {{VARIABLES}} from an environment so a rotated token only needs updating in one place.',
      ])
    }
    case 403:
      return base('The server understood the request and the identity, but that identity is not allowed to do this.', [sentCredentials ? 'The account/token lacks the required permission or scope.' : 'The endpoint needs credentials that were not sent.', 'IP allow-listing, WAF or bot protection may be blocking the request.', 'The resource belongs to another user or organisation.'], [
        'Check the scopes/roles granted to the token.',
        'Look at the response body and headers (for example a WAF block page).',
        'Confirm you are calling the correct environment and account.',
      ])
    case 404:
      return base('Nothing exists at this URL, or the resource is hidden from this identity.', ['Typo in the path, or the wrong base URL / API version.', 'The resource id does not exist (or was deleted).', 'Some APIs return 404 instead of 403 for resources you cannot access.'], [
        'Check the path, the version prefix (/v1) and trailing slashes.',
        'Verify {{variables}} resolve to the base URL you expect (hover the URL bar).',
        'Try listing the collection endpoint to confirm the resource id exists.',
      ])
    case 405: {
      const allow = header(ctx.responseHeaders, 'allow')
      return base('The URL exists but does not support this HTTP method.', [allow ? `Allowed methods: ${allow}.` : 'This endpoint only supports other HTTP methods.'], ['Switch the method to one the API documents for this path.', 'Send an OPTIONS request to discover allowed methods.'])
    }
    case 406:
      return base('The server cannot produce a response in a format your Accept header allows.', ['The Accept header asks for a media type the API does not serve.'], ['Remove the Accept header or set it to application/json.'])
    case 408:
      return base('The server gave up waiting for the request.', ['Slow connection or a very large body.'], ['Retry the request.', 'Reduce the payload size.'])
    case 409:
      return base('The request conflicts with the current state of the resource.', ['The resource already exists (duplicate key) or was modified concurrently.'], ['Fetch the current state first.', 'Use a different unique value, or PUT/PATCH the existing resource.'])
    case 410:
      return base('The resource used to exist but has been permanently removed.', ['The endpoint or record was deleted or the API version retired.'], ['Check the API changelog for a replacement endpoint.'])
    case 413:
      return base('The request body is larger than the server accepts.', ['The payload exceeds the server or proxy size limit.'], ['Send a smaller payload or use the API upload mechanism for large files.'])
    case 415: {
      const ct = req ? (req.body.mode === 'json' ? 'application/json' : req.body.mode === 'urlencoded' ? 'application/x-www-form-urlencoded' : req.body.mode === 'form-data' ? 'multipart/form-data' : req.body.mode === 'raw' ? req.body.rawContentType : 'none') : 'unknown'
      return base('The server does not support the format of the request body.', [`This request sent a body of type: ${ct}.`], ['Check which Content-Type the API expects (usually application/json).', 'Switch the Body tab type or set the Content-Type header explicitly.'])
    }
    case 422:
      return base('The request is well-formed but failed validation.', ['A required field is missing or a value violates a business rule.'], [serverMessage ? `Fix what the server reported: "${serverMessage}".` : 'Read the response body for the per-field validation errors.', 'Check enums, formats and required fields in the API documentation.'])
    case 429: {
      const limits = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset']
        .map((h) => ({ h, v: header(ctx.responseHeaders, h) }))
        .filter((x) => x.v)
        .map((x) => `${x.h}: ${x.v}`)
      return base('You have sent too many requests in a given period.', [retryAfter ? `The server asks you to wait ${retryAfter}${/^\d+$/.test(retryAfter) ? ' seconds' : ''} (Retry-After).` : 'A rate limit or quota was exceeded.', ...limits], ['Wait before retrying and back off exponentially.', 'Reduce request frequency or cache responses.', 'Check whether your plan has a higher quota.'])
    }
    case 500:
      return base('The server hit an unexpected error while handling a valid-looking request.', ['A bug or unhandled exception on the server.', 'A bad input that the server failed to validate gracefully.', 'A dependency (database, upstream API) failed.'], [serverMessage ? `The server said: "${serverMessage}".` : 'Check the response body for an error id or message.', 'Retry once to rule out a transient failure; if it persists, look at the server logs.', 'Try a minimal request to isolate which field triggers it.'])
    case 501:
      return base('The server does not implement the functionality required for this request.', ['The method or feature is not supported by this API.'], ['Check the API docs for supported methods.'])
    case 502:
      return base('A gateway or proxy received an invalid response from the upstream server.', ['The upstream service crashed, restarted or is unreachable.', 'A deployment is in progress.'], ['Retry after a short delay.', 'Check the status page of the API provider.'])
    case 503:
      return base('The server is temporarily unable to handle the request.', [retryAfter ? `The server suggests retrying after ${retryAfter}.` : 'The service is overloaded or under maintenance.'], ['Retry with exponential backoff.', 'Check the provider status page.'])
    case 504:
      return base('A gateway timed out waiting for the upstream server.', ['The upstream service is too slow or hung.'], ['Retry later or with a smaller request.', 'For long operations look for an async/polling endpoint.'])
  }
  if (status >= 500) return base('The server failed to fulfil the request.', ['A server-side error.'], ['Retry later.', 'Contact the API provider if it persists.'])
  return base('The request was rejected by the server.', ['A client-side problem with the request.'], ['Check the response body for details.'])
}
