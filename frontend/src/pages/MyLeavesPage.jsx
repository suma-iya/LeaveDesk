import { CalendarDays, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { cancelLeave, getMyLeaves, getMySummary } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { PageHeader } from '@/components/AppLayout'
import { ApplyLeaveDialog } from '@/components/ApplyLeaveDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { LeaveTable } from '@/components/LeaveTable'
import { EmptyState, ErrorState, LoadingState } from '@/components/PageState'
import { StatCard } from '@/components/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function MyLeavesPage() {
  const leaves = useAsync(getMyLeaves, [])
  const summary = useAsync(getMySummary, [])
  const refresh = () => { leaves.reload(); summary.reload() }

  async function handleCancel(leave) {
    try {
      await cancelLeave(leave.id)
      toast.success('Leave request cancelled')
      refresh()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const s = summary.data
  return (
    <>
      <PageHeader title="My leaves" description="Apply for leave and follow the status of your requests.">
        <ApplyLeaveDialog onApplied={refresh} />
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Pending" value={s?.pending} icon={Clock} accent="text-yellow-600" />
        <StatCard label="Approved" value={s?.approved} icon={CheckCircle2} accent="text-green-600" />
        <StatCard label="Rejected" value={s?.rejected} icon={XCircle} accent="text-red-600" />
        <StatCard label="Days off this year" value={s?.approved_days_this_year} icon={CalendarDays}
          hint="Approved days only" />
      </div>

      <Card>
        <CardHeader><CardTitle>My requests</CardTitle></CardHeader>
        <CardContent>
          {leaves.loading && !leaves.data ? <LoadingState />
            : leaves.error ? <ErrorState error={leaves.error} onRetry={leaves.reload} />
            : leaves.data.length === 0 ? (
              <EmptyState title="No leave requests yet" description='Use "Apply for leave" to create your first one.' />
            ) : (
              <LeaveTable
                leaves={leaves.data}
                renderActions={(leave) => leave.status === 'PENDING' && (
                  <ConfirmDialog
                    trigger={<Button size="sm" variant="ghost" className="text-destructive">Cancel</Button>}
                    title="Cancel this leave request?"
                    description="The request will be removed. You can apply again later."
                    confirmLabel="Cancel request"
                    onConfirm={() => handleCancel(leave)}
                  />
                )}
              />
            )}
        </CardContent>
      </Card>
    </>
  )
}
