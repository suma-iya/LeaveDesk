import { lazy, Suspense, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Info, Pencil, X } from 'lucide-react'
import { api } from '@/api'
import { keys, useRequestDetail } from '@/api/queries'
import { Alert } from '@/components/Alert'
import { AppButton } from '@/components/AppButton'
import { Avatar } from '@/components/Avatar'
import { BalanceBar } from '@/components/BalanceBar'
import { Card, CardTitle, StatTile } from '@/components/Card'
import { LeaveTypeTag } from '@/components/LeaveTypeTag'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/States'
import { StatusBadge } from '@/components/StatusBadge'
import { StickyBar } from '@/components/StickyBar'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useUser } from '@/features/auth/AuthProvider'
import { HRResponse } from '@/features/employee/RequestDetailsPage'
import { formatDate, formatDateWithWeekday, formatRange } from '@/lib/dates'
import { fullName } from '@/lib/format'
import { pluralDays, sumBalances } from '@/lib/leave'
import { useIsMobile } from '@/lib/useIsMobile'
import type { HrList } from './columns'
import { decideWithUndo } from './decisions'

const AttachmentPreview = lazy(() => import('@/features/employee/AttachmentPreview'))

const LISTS: Record<HrList, { label: string; to: string }> = {
  pending: { label: 'Pending', to: '/hr/pending' },
  approved: { label: 'Approved', to: '/hr/requests?status=approved' },
  all: { label: 'All', to: '/hr/requests?status=all' },
}

export function ReviewPage() {
  const { id = '' } = useParams()
  const me = useUser()
  const location = useLocation()
  const navigate = useNavigate()
  const client = useQueryClient()
  const isMobile = useIsMobile()
  const detail = useRequestDetail(id)
  const overlaps = useQuery({ queryKey: keys.overlaps(id), queryFn: () => api.requests.overlaps(id) })
  const [note, setNote] = useState('')

  if (detail.isPending) return <Skeleton className="h-[520px] rounded-card" />
  if (detail.error) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />

  const { request: r, balances } = detail.data
  const fromState = (location.state as { from?: HrList } | null)?.from
  const list = LISTS[fromState ?? (r.status === 'pending' ? 'pending' : 'all')]
  const own = r.employee.id === me.id
  const pending = r.status === 'pending'
  const totals = sumBalances(balances)
  // "If approved": the allowance minus approved days minus this request.
  const leftIfApproved = totals.limit - totals.used - r.workingDays
  const year = Number(r.startDate.slice(0, 4))
  const team = r.employee.department?.name
  const away = overlaps.data ?? []

  // Decide with the same 5-second Undo as the table rows, then go back.
  const decide = (status: 'approved' | 'rejected') => {
    decideWithUndo(client, r, status, note)
    navigate(list.to)
  }

  const employeeCard = (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3">
        <Avatar name={fullName(r.employee)} src={r.employee.avatarUrl} size={48} />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-bold">{fullName(r.employee)}</p>
          <p className="text-[13px] text-muted-foreground">
            {[team, r.employee.age !== undefined && `age ${r.employee.age}`, r.employee.joinedOn && `joined ${formatDate(r.employee.joinedOn)}`].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <BalanceBar used={totals.used} limit={totals.limit} width={isMobile ? 'full' : 200} />
      {pending && (
        <p className="text-[13px] text-muted-foreground">
          If approved: <strong className="font-semibold text-foreground">{pluralDays(Math.max(0, leftIfApproved))}</strong> left for {year}
        </p>
      )}
    </Card>
  )

  const detailsCard = (
    <Card className="flex flex-col gap-4 p-5">
      <CardTitle>Request details</CardTitle>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <StatTile label="Leave type" value={<LeaveTypeTag type={r.type} className="text-sm" />} />
        <StatTile label="From" value={<span className="text-sm">{formatDateWithWeekday(r.startDate)}</span>} />
        <StatTile label="To" value={<span className="text-sm">{formatDateWithWeekday(r.endDate)}</span>} />
        <StatTile label="Working days" value={r.workingDays} />
        <StatTile label="Submitted" value={<span className="text-sm">{formatDate(r.submittedAt.slice(0, 10))}</span>} />
      </div>
    </Card>
  )

  const message = (
    <Card className="flex flex-col gap-2 p-5">
      <CardTitle>Message from {r.employee.firstName}</CardTitle>
      <p className="text-sm whitespace-pre-line">{r.reason || <span className="text-muted-foreground">No message.</span>}</p>
    </Card>
  )

  const overlapWarning = away.length > 0 && (
    <Alert tone="warning">
      <strong className="font-semibold">
        {away.length} {away.length === 1 ? 'teammate' : 'teammates'}{team ? ` in ${team}` : ''} {away.length === 1 ? 'is' : 'are'} away during these dates:
      </strong>{' '}
      {away.map((o) => `${fullName(o.employee)} (${formatRange(o.startDate, o.endDate)}${o.status === 'pending' ? ', pending' : ''})`).join(', ')}
    </Alert>
  )

  const decision = own ? (
    <Alert tone="warning">
      <span className="flex flex-wrap items-center gap-2">
        <Info className="size-4" aria-hidden /> Another HR must decide your own request.
        {pending && <AppButton icon={Pencil} label="Edit request" to={`/me/request/new?edit=${r.id}`} className="ml-auto" />}
      </span>
    </Alert>
  ) : pending ? (
    <Card className="flex flex-col gap-3 p-5">
      <CardTitle>Decision</CardTitle>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="decision-note">Note</Label>
        <Textarea id="decision-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Visible to the employee" />
      </div>
      {!isMobile && (
        <div className="flex justify-end gap-2">
          <AppButton icon={X} label="Reject" variant="danger" onClick={() => decide('rejected')} />
          <AppButton icon={Check} label="Approve" variant="ok" onClick={() => decide('approved')} />
        </div>
      )}
    </Card>
  ) : <HRResponse request={r} />

  return (
    <>
      <PageHeader
        back={{ to: list.to, label: `Back to ${list.label}` }}
        breadcrumb={[{ label: list.label, to: list.to }, { label: `Request ${r.code}` }]}
        title="Leave application"
        titleAside={<StatusBadge status={r.status} />}
      />
      <div className="flex flex-col items-start gap-5 lg:flex-row">
        <div className="flex w-full min-w-0 flex-1 flex-col gap-5">
          {employeeCard}
          {detailsCard}
          {message}
          {overlapWarning}
          {decision}
        </div>
        {r.attachment && (
          <Suspense fallback={<Skeleton className="h-[560px] w-full rounded-card lg:w-[500px]" />}>
            <AttachmentPreview attachment={r.attachment} className="w-full shrink-0 lg:w-[500px]" />
          </Suspense>
        )}
      </div>
      {isMobile && pending && !own && (
        <StickyBar className="grid-cols-2">
          <AppButton icon={X} label="Reject" variant="danger" size="sticky" onClick={() => decide('rejected')} />
          <AppButton icon={Check} label="Approve" variant="ok" size="sticky" onClick={() => decide('approved')} />
        </StickyBar>
      )}
    </>
  )
}
