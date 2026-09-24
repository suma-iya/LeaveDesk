import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import type { Role } from '@/types'
import { useAuth } from './AuthProvider'
import { homeFor } from './homeFor'

function FullPageLoader() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-10" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-24 w-full rounded-card" />
    </div>
  )
}

/** Must be signed in. Remembers where the user was going. */
export function RequireAuth() {
  const { user, role, checking } = useAuth()
  const location = useLocation()
  if (checking) return <FullPageLoader />
  if (!user || !role) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

/**
 * Role from the JWT decides which pages render. This is for navigation only;
 * the API enforces the same rule on every request.
 */
export function RequireRole({ role }: { role: Role }) {
  const { role: current } = useAuth()
  if (current !== role) return <Navigate to={current ? homeFor(current) : '/login'} replace />
  return <Outlet />
}

export function HomeRedirect() {
  const { role } = useAuth()
  return <Navigate to={role ? homeFor(role) : '/login'} replace />
}
