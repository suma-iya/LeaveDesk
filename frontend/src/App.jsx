import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { AppLayout } from '@/components/AppLayout'
import { HomeRedirect, ProtectedRoute } from '@/components/ProtectedRoute'
import { LoadingState } from '@/components/PageState'
import { Toaster } from '@/components/ui/sonner'
import EmployeeDetailPage from '@/pages/EmployeeDetailPage'
import EmployeesPage from '@/pages/EmployeesPage'
import LeaveRequestsPage from '@/pages/LeaveRequestsPage'
import LoginPage from '@/pages/LoginPage'
import ManagerDashboardPage from '@/pages/ManagerDashboardPage'
import MyLeavesPage from '@/pages/MyLeavesPage'
import NotFoundPage from '@/pages/NotFoundPage'

function AppRoutes() {
  const { checking } = useAuth()

  // Wait until we know whether the stored token is still valid.
  if (checking) {
    return <div className="mx-auto max-w-md p-10"><LoadingState /></div>
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<HomeRedirect />} />

          <Route element={<ProtectedRoute role="EMPLOYEE" />}>
            <Route path="/my-leaves" element={<MyLeavesPage />} />
          </Route>

          <Route element={<ProtectedRoute role="MANAGER" />}>
            <Route path="/dashboard" element={<ManagerDashboardPage />} />
            <Route path="/requests" element={<LeaveRequestsPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/employees/:id" element={<EmployeeDetailPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </BrowserRouter>
  )
}
