import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Clock, LogOut, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { AppButton } from '@/components/AppButton'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDate } from '@/lib/dates'
import { fullName } from '@/lib/format'
import { useAuth } from './AuthProvider'
import { AuthLayout } from './AuthLayout'
import { homeFor } from './homeFor'

/** What a pending account sees until HR approves it. */
export function WaitingPage() {
  const { user, signOut, signedIn } = useAuth()
  const navigate = useNavigate()
  const check = useMutation({
    mutationFn: api.auth.me,
    onSuccess: ({ user: fresh }) => {
      if (fresh.status === 'active') {
        signedIn(fresh)
        navigate(homeFor(fresh), { replace: true })
      } else toast('Still waiting for HR. Check again later.')
    },
    onError: (error) => toast.error(error.message),
  })
  if (!user) return null

  const rows: [string, React.ReactNode][] = [
    ['Name', fullName(user)],
    ['Email', user.email],
    ['Date of birth', `${formatDate(user.dateOfBirth)} (age ${user.age})`],
    ['Registered', formatDate(user.createdAt.slice(0, 10))],
    ['Status', <StatusBadge key="s" status="pending" />],
  ]

  return (
    <AuthLayout title="Waiting for HR approval">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-tile bg-pending-bg text-pending">
          <Clock className="size-6" aria-hidden />
        </span>
        <div>
          <p className="font-semibold">Thanks, {user.firstName}. HR will review your account.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When HR approves it and adds you to a department, you can request leave and see the team calendar.
          </p>
        </div>
      </div>
      <dl className="mt-6 divide-y rounded-tile border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 grid grid-cols-2 gap-2">
        <AppButton icon={LogOut} label="Sign out" size="block" onClick={() => void signOut()} />
        <AppButton icon={RefreshCw} label="Check again" variant="primary" size="block" loading={check.isPending} onClick={() => check.mutate()} />
      </div>
    </AuthLayout>
  )
}
