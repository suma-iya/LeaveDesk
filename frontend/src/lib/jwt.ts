import type { Role } from '@/types'

interface Claims {
  sub: string
  role: Role
  exp?: number
}

/**
 * Reads (does not verify) the JWT payload so the UI can route by role.
 * The server verifies the signature on every request; this is navigation only.
 */
export function readClaims(token: string): Claims | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    const raw = String(json.role ?? '').toLowerCase()
    // The Go API currently says MANAGER/EMPLOYEE; LeaveDesk says hr/employee.
    const role: Role = raw === 'hr' || raw === 'manager' ? 'hr' : 'employee'
    return { sub: String(json.sub), role, exp: typeof json.exp === 'number' ? json.exp : undefined }
  } catch {
    return null
  }
}

export const isExpired = (claims: Claims) => claims.exp !== undefined && claims.exp * 1000 <= Date.now()
