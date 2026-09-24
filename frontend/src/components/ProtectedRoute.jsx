import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

// Client-side guard for nicer navigation only. Real security is enforced by
// the backend middleware, which checks the JWT and role on every request.
export function ProtectedRoute({ role }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  if (role && user.role !== role) return <Navigate to="/" replace />
  return <Outlet />
}

// Sends each role to its own start page.
export function HomeRedirect() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={user.role === 'MANAGER' ? '/dashboard' : '/my-leaves'} replace />
}
