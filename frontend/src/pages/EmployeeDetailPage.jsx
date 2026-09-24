import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { getEmployee } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { PageHeader } from '@/components/AppLayout'
import { LeaveTable } from '@/components/LeaveTable'
import { EmptyState, ErrorState, LoadingState } from '@/components/PageState'
import { ReviewActions } from '@/components/ReviewActions'
import { StatCard } from '@/components/StatCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// One employee's full leave list, reached from the Employees page.
export default function EmployeeDetailPage() {
  const { id } = useParams()
  const detail = useAsync(() => getEmployee(id), [id])

  const back = (
    <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
      <Link to="/employees"><ArrowLeft /> All employees</Link>
    </Button>
  )

  if (detail.loading && !detail.data) return <>{back}<LoadingState rows={5} /></>
  if (detail.error) return <>{back}<ErrorState error={detail.error} onRetry={detail.reload} /></>

  const { employee, summary, leaves } = detail.data
  return (
    <>
      {back}
      <PageHeader
        title={employee.name}
        description={[employee.email, employee.department].filter(Boolean).join(' · ')}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Pending" value={summary.pending} icon={Clock} accent="text-yellow-600" />
        <StatCard label="Approved" value={summary.approved} icon={CheckCircle2} accent="text-green-600" />
        <StatCard label="Rejected" value={summary.rejected} icon={XCircle} accent="text-red-600" />
        <StatCard label="Days off this year" value={summary.approved_days_this_year} icon={CalendarDays} />
      </div>

      <Card>
        <CardHeader><CardTitle>Leave history</CardTitle></CardHeader>
        <CardContent>
          {leaves.length === 0 ? <EmptyState title={`${employee.name} has not requested any leave`} />
            : (
              <LeaveTable leaves={leaves}
                renderActions={(leave) => <ReviewActions leave={{ ...leave, employee_name: employee.name }} onReviewed={detail.reload} />} />
            )}
        </CardContent>
      </Card>
    </>
  )
}
