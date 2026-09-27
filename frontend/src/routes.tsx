import { createBrowserRouter, Outlet } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { GuestOnly, HomeRedirect, RequireAuth, RequireRole } from '@/features/auth/guards'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { SignInPage } from '@/features/auth/SignInPage'
import { TeamCalendarPage } from '@/features/calendar/TeamCalendarPage'
import { HistoryPage } from '@/features/employee/HistoryPage'
import { MyLeavePage } from '@/features/employee/MyLeavePage'
import { RequestDetailsPage } from '@/features/employee/RequestDetailsPage'
import { RequestFormPage } from '@/features/employee/RequestFormPage'
import { EmployeePage } from '@/features/hr/EmployeePage'
import { PeoplePage } from '@/features/hr/PeoplePage'
import { PendingPage } from '@/features/hr/PendingPage'
import { RequestsPage } from '@/features/hr/RequestsPage'
import { ReviewPage } from '@/features/hr/ReviewPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { AppShell } from '@/layouts/AppShell'
import { NotFoundPage } from '@/layouts/NotFoundPage'

// The guards only decide what renders; the API enforces the same rules.
export const router = createBrowserRouter([
  {
    element: <AuthProvider><Outlet /></AuthProvider>,
    children: [
      { index: true, element: <HomeRedirect /> },
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <SignInPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                element: <RequireRole role="employee" />,
                children: [
                  { path: '/me', element: <MyLeavePage /> },
                  { path: '/me/history', element: <HistoryPage /> },
                  { path: '/me/requests/:id', element: <RequestDetailsPage /> },
                ],
              },
              {
                element: <RequireRole role="hr" />,
                children: [
                  { path: '/hr/pending', element: <PendingPage /> },
                  { path: '/hr/requests', element: <RequestsPage /> }, // ?status=approved|all
                  { path: '/hr/requests/:id', element: <ReviewPage /> },
                  { path: '/hr/people', element: <PeoplePage /> },
                  { path: '/hr/people/:id', element: <EmployeePage /> },
                ],
              },
              // Both roles request leave (HR's own requests are decided by another HR) and see the team calendar.
              { path: '/me/request/new', element: <RequestFormPage /> }, // ?edit=ID | ?from=ID
              { path: '/calendar', element: <TeamCalendarPage /> }, // ?month=2026-09&day=2026-09-28
              { path: '/profile', element: <ProfilePage /> },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
])
