import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import type { Role } from '@/types'
import { useAuth } from './AuthProvider'
import { homeFor } from './homeFor'

// These guards only decide what renders. The API applies the same rules
// (401, 403 ACCOUNT_PENDING, role checks) on every request.

function Loading() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-10" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-24 w-full rounded-card" />
    </div>
  )
}

/** Signed in and approved by HR. */
export function RequireActive() {
  const { user } = useAuth()
  const location = useLocation()
  if (user === undefined) return <Loading />
  if (user === null) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (user.status === 'pending') return <Navigate to="/waiting" replace />
  return <Outlet />
}

export function RequireRole({ role }: { role: Role }) {
  const { user } = useAuth()
  if (user && user.role !== role) return <Navigate to={homeFor(user)} replace />
  return <Outlet />
}

/** Signed in but still waiting for HR. */
export function RequirePending() {
  const { user } = useAuth()
  if (user === undefined) return <Loading />
  if (user === null) return <Navigate to="/login" replace />
  if (user.status !== 'pending') return <Navigate to={homeFor(user)} replace />
  return <Outlet />
}

/** Sign in / register: bounce signed-in users to their home. */
export function GuestOnly() {
  const { user } = useAuth()
  if (user === undefined) return <Loading />
  if (user) return <Navigate to={homeFor(user)} replace />
  return <Outlet />
}

export function HomeRedirect() {
  const { user } = useAuth()
  if (user === undefined) return <Loading />
  return <Navigate to={user ? homeFor(user) : '/login'} replace />
}
