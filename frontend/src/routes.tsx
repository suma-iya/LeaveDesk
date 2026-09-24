import { createBrowserRouter, Outlet } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { HomeRedirect, RequireAuth, RequireRole } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { TeamCalendarPage } from '@/features/calendar/TeamCalendarPage'
import { HistoryPage } from '@/features/employee/HistoryPage'
import { MyLeavePage } from '@/features/employee/MyLeavePage'
import { RequestDetailsPage } from '@/features/employee/RequestDetailsPage'
import { RequestLeavePage } from '@/features/employee/RequestLeavePage'
import { AllRequestsPage } from '@/features/manager/AllRequestsPage'
import { ApprovedPage } from '@/features/manager/ApprovedPage'
import { PendingPage } from '@/features/manager/PendingPage'
import { RequestReviewPage } from '@/features/manager/RequestReviewPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { AppShell } from '@/layouts/AppShell'
import { NotFoundPage } from '@/layouts/NotFoundPage'

// Route tree. Roles come from the JWT; RequireRole only decides what renders,
// the API checks the role again on every request.
export const router = createBrowserRouter([
  {
    element: <AuthProvider><Outlet /></AuthProvider>,
    children: [
      { path: '/login', element: <LoginPage /> },
      {
        element: <RequireAuth />,
        children: [{
          element: <AppShell />,
          children: [
            { index: true, element: <HomeRedirect /> },
            {
              element: <RequireRole role="hr" />,
              children: [
                { path: '/hr/pending', element: <PendingPage /> },
                { path: '/hr/approved', element: <ApprovedPage /> },
                { path: '/hr/requests', element: <AllRequestsPage /> },
                { path: '/hr/requests/:id', element: <RequestReviewPage /> },
              ],
            },
            {
              element: <RequireRole role="employee" />,
              children: [
                { path: '/me', element: <MyLeavePage /> },
                { path: '/me/history', element: <HistoryPage /> },
                { path: '/me/request/new', element: <RequestLeavePage /> }, // ?edit=ID or ?from=ID
                { path: '/me/requests/:id', element: <RequestDetailsPage /> },
              ],
            },
            { path: '/calendar', element: <TeamCalendarPage /> },
            { path: '/profile', element: <ProfilePage /> },
            { path: '*', element: <NotFoundPage /> },
          ],
        }],
      },
    ],
  },
])
