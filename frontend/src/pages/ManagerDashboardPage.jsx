import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, Inbox, Plane, Users, XCircle } from 'lucide-react'
import { getDashboard, getLeaves } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { PageHeader } from '@/components/AppLayout'
import { LeaveTable } from '@/components/LeaveTable'
import { EmptyState, ErrorState, LoadingState } from '@/components/PageState'
import { ReviewActions } from '@/components/ReviewActions'
import { StatCard } from '@/components/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatDate, todayISO } from '@/lib/format'

export default function ManagerDashboardPage() {
  const [date, setDate] = useState(todayISO())
  const isToday = date === todayISO()

  const stats = useAsync(() => getDashboard(date), [date])
  const received = useAsync(() => getLeaves({ createdOn: date }), [date])
  const pending = useAsync(() => getLeaves({ status: 'PENDING' }), [])
  const refresh = () => { stats.reload(); received.reload(); pending.reload() }

  const s = stats.data
  const dayLabel = isToday ? 'today' : `on ${formatDate(date)}`

  return (
    <>
      <PageHeader title="Dashboard" description="Overview of your team's leave requests.">
        <div className="space-y-1">
          <Label htmlFor="dashboard-date" className="text-xs text-muted-foreground">Day</Label>
          <Input id="dashboard-date" type="date" value={date} max={todayISO()}
            onChange={(e) => e.target.value && setDate(e.target.value)} className="w-44" />
        </div>
        {!isToday && <Button variant="outline" onClick={() => setDate(todayISO())}>Today</Button>}
      </PageHeader>

      {stats.error ? (
        <div className="mb-6"><ErrorState error={stats.error} onRetry={stats.reload} /></div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Pending" value={s?.pending} icon={Clock} accent="text-yellow-600" hint="Waiting for you" />
          <StatCard label="Approved" value={s?.approved} icon={CheckCircle2} accent="text-green-600" hint="All time" />
          <StatCard label="Rejected" value={s?.rejected} icon={XCircle} accent="text-red-600" hint="All time" />
          <StatCard label="Requests received" value={s?.requests_on_date} icon={Inbox} hint={`Submitted ${dayLabel}`} />
          <StatCard label="On leave" value={s?.on_leave_on_date} icon={Plane} hint={`Approved, ${dayLabel}`} />
          <StatCard label="Employees" value={s?.total_employees} icon={Users} />
        </div>
      )}

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Awaiting your decision</CardTitle>
            <CardDescription>All pending requests, newest first.</CardDescription>
            <CardAction>
              <Button variant="link" asChild><Link to="/requests">View all requests</Link></Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {pending.loading && !pending.data ? <LoadingState />
              : pending.error ? <ErrorState error={pending.error} onRetry={pending.reload} />
              : pending.data.length === 0 ? <EmptyState title="You're all caught up" description="No pending leave requests." />
              : (
                <LeaveTable leaves={pending.data} showEmployee linkEmployee
                  renderActions={(leave) => <ReviewActions leave={leave} onReviewed={refresh} />} />
              )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requests received {dayLabel}</CardTitle>
            <CardDescription>
              {received.data ? `${received.data.length} request${received.data.length === 1 ? '' : 's'} submitted ${dayLabel}.` : 'Loading…'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {received.loading && !received.data ? <LoadingState />
              : received.error ? <ErrorState error={received.error} onRetry={received.reload} />
              : received.data.length === 0 ? <EmptyState title={`No requests ${dayLabel}`} />
              : (
                <LeaveTable leaves={received.data} showEmployee linkEmployee
                  renderActions={(leave) => <ReviewActions leave={leave} onReviewed={refresh} />} />
              )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
