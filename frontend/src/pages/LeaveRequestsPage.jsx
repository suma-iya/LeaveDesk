import { useState } from 'react'
import { getEmployees, getLeaves } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { PageHeader } from '@/components/AppLayout'
import { LeaveTable } from '@/components/LeaveTable'
import { EmptyState, ErrorState, LoadingState } from '@/components/PageState'
import { ReviewActions } from '@/components/ReviewActions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

const STATUS_TABS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED']
const ALL_EMPLOYEES = 'ALL'

export default function LeaveRequestsPage() {
  const [status, setStatus] = useState('PENDING')
  const [createdOn, setCreatedOn] = useState('')
  const [employeeId, setEmployeeId] = useState(ALL_EMPLOYEES)

  const filters = {
    status: status === 'ALL' ? '' : status,
    createdOn,
    employeeId: employeeId === ALL_EMPLOYEES ? '' : employeeId,
  }
  const leaves = useAsync(() => getLeaves(filters), [filters.status, filters.createdOn, filters.employeeId])
  const employees = useAsync(getEmployees, [])

  const hasFilters = createdOn || employeeId !== ALL_EMPLOYEES

  return (
    <>
      <PageHeader title="Leave requests" description="Review and filter every request from your team." />

      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            {STATUS_TABS.map((s) => (
              <TabsTrigger key={s} value={s} className="capitalize">{s.toLowerCase()}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="filter-employee" className="text-xs text-muted-foreground">Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger id="filter-employee" className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_EMPLOYEES}>All employees</SelectItem>
                {employees.data?.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="filter-date" className="text-xs text-muted-foreground">Submitted on</Label>
            <Input id="filter-date" type="date" value={createdOn} onChange={(e) => setCreatedOn(e.target.value)} className="w-44" />
          </div>
          {hasFilters && (
            <Button variant="ghost" onClick={() => { setCreatedOn(''); setEmployeeId(ALL_EMPLOYEES) }}>Clear</Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent>
          {leaves.loading && !leaves.data ? <LoadingState rows={5} />
            : leaves.error ? <ErrorState error={leaves.error} onRetry={leaves.reload} />
            : leaves.data.length === 0 ? <EmptyState title="No requests match these filters" />
            : (
              <LeaveTable leaves={leaves.data} showEmployee linkEmployee
                renderActions={(leave) => <ReviewActions leave={leave} onReviewed={leaves.reload} />} />
            )}
        </CardContent>
      </Card>
    </>
  )
}
