import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Briefcase, Cake, Check, Mail, UserRound, X } from 'lucide-react'
import { Alert } from '@/components/Alert'
import { AttachmentRow } from '@/components/AttachmentRow'
import { Avatar } from '@/components/Avatar'
import { BalanceBar } from '@/components/BalanceBar'
import { Button } from '@/components/Button'
import { Card, CardTitle, StatTile } from '@/components/Card'
import { InfoRow } from '@/components/InfoRow'
import { LeaveTypeTag } from '@/components/LeaveTypeTag'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/States'
import { StatusBadge } from '@/components/StatusBadge'
import { StickyBar } from '@/components/StickyBar'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useSubPage } from '@/layouts/subPage'
import { formatDate, formatDateWithWeekday, formatRange } from '@/lib/dates'
import { fullName } from '@/lib/format'
import { pluralDays, sumBalances } from '@/lib/leave'
import { useIsMobile } from '@/lib/useIsMobile'
import type { HrList } from './columns'
import { useRequestDetail } from '@/api/queries'
import { useDecide } from './hooks'

const LISTS: Record<HrList, { label: string; to: string }> = {
  pending: { label: 'Pending requests', to: '/hr/pending' },
  approved: { label: 'Approved', to: '/hr/approved' },
  all: { label: 'All requests', to: '/hr/requests' },
}

export function RequestReviewPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const detail = useRequestDetail(id)
  const decide = useDecide()
  const [note, setNote] = useState('')

  const fromState = (location.state as { from?: HrList } | null)?.from
  const list = LISTS[fromState ?? (detail.data?.request.status === 'pending' ? 'pending' : 'all')]
  useSubPage('Leave application', list.to)

  if (detail.isPending) return <ReviewSkeleton />
  if (detail.error) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />

  const { request: r, employee, balances, overlapping, decider } = detail.data
  const name = fullName(employee)
  const year = Number(r.startDate.slice(0, 4))
  const totals = sumBalances(balances)
  const leftNow = totals.allowance - totals.used
  const isPending = r.status === 'pending'

  const submit = (status: 'approved' | 'rejected', decisionNote: string) =>
    decide.mutate({ rows: [detail.data], decision: { status, note: decisionNote } }, { onSuccess: () => navigate(list.to) })

  const onReject = () => submit('rejected', note)

  return (
    <>
      <PageHeader
        back={{ to: list.to, label: `Back to ${list.label}` }}
        breadcrumb={[{ label: list.label, to: list.to }, { label: `Request ${r.id}` }]}
        title="Leave application"
      />

      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <div className="flex flex-col gap-5">
          <Card className="p-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <Avatar name={name} src={employee.avatarUrl} size={isMobile ? 60 : 96} />
              <div>
                <p className="text-[17px] font-bold">{name}</p>
                <p className="text-[13px] text-muted-foreground">{employee.jobTitle} · {employee.department}</p>
              </div>
            </div>
            <hr className="my-4" />
            <InfoRow icon={UserRound} label="First name" value={employee.firstName} />
            <InfoRow icon={UserRound} label="Last name" value={employee.lastName} />
            <InfoRow icon={Cake} label="Age" value={employee.age} />
            <InfoRow icon={Briefcase} label="At company" value={`${employee.yearsAtCompany} ${employee.yearsAtCompany === 1 ? 'year' : 'years'}`} />
            <InfoRow icon={Mail} label="Email" value={employee.email} />
          </Card>

          <Card className="flex flex-col gap-4 p-5">
            <CardTitle>Yearly vacation {year}</CardTitle>
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Allowance" value={totals.allowance} />
              <StatTile label="Used" value={totals.used} />
              <StatTile label="Left" value={leftNow} />
            </div>
            <BalanceBar used={totals.used} allowance={totals.allowance} className="w-full" />
            {isPending && (
              <p className="text-[13px] text-muted-foreground">
                If approved: <strong className="font-semibold text-foreground">{pluralDays(Math.max(0, leftNow - r.workingDays))}</strong> left for {year}
              </p>
            )}
          </Card>
        </div>

        {/* On small screens the application comes first. */}
        <div className="order-first flex flex-col gap-5 lg:order-none">
          {overlapping.length > 0 && (
            <Alert tone="warning">
              <strong className="font-semibold">
                {overlapping.length} {overlapping.length === 1 ? 'teammate' : 'teammates'} away during these dates:
              </strong>{' '}
              {overlapping.map((o) => `${fullName(o.employee)} (${formatRange(o.request.startDate, o.request.endDate)}${o.request.status === 'pending' ? ', pending' : ''})`).join(', ')}
            </Alert>
          )}

          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Application</CardTitle>
              <StatusBadge status={r.status} />
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <StatTile label="Leave type" value={<LeaveTypeTag type={r.type} className="text-sm" />} />
              <StatTile label="From" value={<span className="text-sm">{formatDateWithWeekday(r.startDate)}</span>} />
              <StatTile label="To" value={<span className="text-sm">{formatDateWithWeekday(r.endDate)}</span>} />
              <StatTile label="Working days" value={r.workingDays} />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-muted-foreground">Reason</p>
              <p className="text-sm whitespace-pre-line">{r.reason}</p>
            </div>
            <p className="text-xs text-muted-foreground">Submitted {formatDate(r.submittedAt)}</p>
            {r.attachment && <AttachmentRow attachment={r.attachment} />}
          </Card>

          {isPending ? (
            <Card className="flex flex-col gap-3 p-5">
              <CardTitle>Decision</CardTitle>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="decision-note">Decision note (optional)</Label>
                <Textarea id="decision-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)}
                  placeholder={`A short note for ${employee.firstName}`} />
              </div>
              {!isMobile && (
                <div className="flex justify-end gap-2">
                  <Button icon={X} label="Reject" variant="danger" disabled={decide.isPending} onClick={onReject} />
                  <Button icon={Check} label="Approve" variant="ok" loading={decide.isPending} onClick={() => submit('approved', note)} />
                </div>
              )}
            </Card>
          ) : (
            <Card className="flex flex-col gap-2 p-5">
              <CardTitle>Decision</CardTitle>
              <p className="text-sm text-muted-foreground">
                {r.status === 'approved' ? 'Approved' : 'Rejected'} on <strong className="font-semibold text-foreground">{r.decidedAt && formatDate(r.decidedAt)}</strong>
                {decider && <> by <strong className="font-semibold text-foreground">{fullName(decider)}</strong></>}
              </p>
              {r.decisionNote && <p className="rounded-tile bg-sunk p-3 text-sm">{r.decisionNote}</p>}
            </Card>
          )}
        </div>
      </div>

      {isPending && isMobile && (
        <StickyBar className="grid-cols-2">
          <Button icon={X} label="Reject" variant="danger" size="sticky" disabled={decide.isPending} onClick={onReject} />
          <Button icon={Check} label="Approve" variant="ok" size="sticky" loading={decide.isPending} onClick={() => submit('approved', note)} />
        </StickyBar>
      )}
    </>
  )
}

function ReviewSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-96 rounded-card" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  )
}
