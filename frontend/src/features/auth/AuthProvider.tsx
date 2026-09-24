import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError, tokenStore } from '@/api'
import { keys } from '@/api/queries'
import { isExpired, readClaims } from '@/lib/jwt'
import type { Employee, Role, Session } from '@/types'

interface AuthContextValue {
  user: Employee | undefined
  role: Role | null
  /** True while a stored token is being checked with /auth/me. */
  checking: boolean
  signIn: (session: Session) => void
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

function initialToken() {
  const token = tokenStore.get()
  const claims = token ? readClaims(token) : null
  if (!token || !claims || isExpired(claims)) {
    tokenStore.clear()
    return null
  }
  return token
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState<string | null>(initialToken)
  const role = token ? readClaims(token)?.role ?? null : null

  const signOut = useCallback(() => {
    tokenStore.clear()
    setToken(null)
    queryClient.clear()
  }, [queryClient])

  const me = useQuery({
    queryKey: [...keys.me, token],
    queryFn: async () => {
      try {
        return await api.me()
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) signOut()
        throw error
      }
    },
    enabled: Boolean(token),
    retry: false,
  })

  const signIn = useCallback((session: Session) => {
    tokenStore.set(session.token)
    queryClient.setQueryData([...keys.me, session.token], session.user)
    setToken(session.token)
  }, [queryClient])

  const value = useMemo<AuthContextValue>(() => ({
    user: me.data,
    role,
    checking: Boolean(token) && me.isPending,
    signIn,
    signOut,
  }), [me.data, me.isPending, role, token, signIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

/** The signed-in user; only call inside routes guarded by RequireAuth. */
// eslint-disable-next-line react-refresh/only-export-components
export function useUser() {
  const { user } = useAuth()
  if (!user) throw new Error('useUser called outside an authenticated route')
  return user
}
