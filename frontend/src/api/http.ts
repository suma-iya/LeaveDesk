// Low-level client. The session is an httpOnly cookie, so JavaScript never
// sees the token: the browser attaches it to every same-origin /api call.

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

// AuthProvider registers what to do when the session is gone.
let onAuthProblem: (error: ApiError) => void = () => {}
export function setAuthProblemHandler(handler: (error: ApiError) => void) {
  onAuthProblem = handler
}

type Query = Record<string, string | number | boolean | string[] | undefined | null>

export function toQuery(params: Query) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','))
    } else search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

/** Calls /api{path}; throws ApiError with the server's {error, message}. */
export async function request<T>(path: string, init: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: BodyInit | undefined
  if (init.body instanceof FormData) body = init.body
  else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.body)
  }

  let response: Response
  try {
    response = await fetch(`/api${path}`, { method: init.method ?? 'GET', headers, body, credentials: 'same-origin', keepalive: init.keepalive })
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.')
  }
  if (response.status === 204) return undefined as T

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new ApiError(response.status, data?.error ?? 'HTTP_ERROR', data?.message ?? response.statusText)
    if (error.status === 401) onAuthProblem(error)
    throw error
  }
  return data as T
}
