import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '@/api'
import { setAuthProblemHandler } from '@/api/http'
import { keys } from '@/api/queries'
import type { Balance, User } from '@/types'

interface AuthContextValue {
  /** undefined while loading, null when signed out. */
  user: User | null | undefined
  balances: Balance[] | undefined
  signedIn: (user: User) => void
  signOut: () => Promise<void>
  refresh: () => Promise<unknown>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Who is signed in comes from GET /api/me. The session itself is an
 * httpOnly cookie that JavaScript cannot read; a 401 means "signed out".
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const me = useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await api.auth.me()
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 60_000,
    retry: false,
  })

  // Any 401 or ACCOUNT_PENDING from another call re-checks /me, which moves
  // the user to /login or the waiting page.
  useEffect(() => {
    setAuthProblemHandler((error) => {
      if (error.status === 401) queryClient.setQueryData(keys.me, null)
      else void queryClient.invalidateQueries({ queryKey: keys.me })
    })
  }, [queryClient])

  const signedIn = useCallback((user: User) => {
    queryClient.clear()
    queryClient.setQueryData(keys.me, { user })
    void queryClient.invalidateQueries({ queryKey: keys.me })
  }, [queryClient])

  const signOut = useCallback(async () => {
    await api.auth.logout().catch(() => {})
    queryClient.clear()
    queryClient.setQueryData(keys.me, null)
  }, [queryClient])

  const value = useMemo<AuthContextValue>(() => ({
    user: me.data === undefined ? undefined : me.data?.user ?? null,
    balances: me.data?.balances,
    signedIn,
    signOut,
    refresh: () => me.refetch(),
  }), [me, signedIn, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

/** The signed-in, active user. Only call inside routes behind RequireActive. */
// eslint-disable-next-line react-refresh/only-export-components
export function useUser() {
  const { user } = useAuth()
  if (!user) throw new Error('useUser called outside an authenticated route')
  return user
}
