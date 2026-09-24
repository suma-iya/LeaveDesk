import { ApiError } from './contract'

// Low-level fetch wrapper used by every real resource client.

const TOKEN_KEY = 'leavedesk-token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

type Query = Record<string, string | number | boolean | string[] | undefined>

export function toQuery(params: Query) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue
    if (Array.isArray(value)) value.forEach((v) => search.append(key, v))
    else search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

/** Calls /api{path} with the JWT; throws ApiError with the server's {"error"} message. */
export async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`

  let body: BodyInit | undefined
  if (init.body instanceof FormData) body = init.body
  else if (init.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(init.body)
  }

  let response: Response
  try {
    response = await fetch(`/api${path}`, { method: init.method ?? 'GET', headers, body })
  } catch {
    throw new ApiError('Cannot reach the server.', 0)
  }
  if (response.status === 204) return undefined as T

  const data = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(data?.error ?? response.statusText, response.status)
  return data as T
}
