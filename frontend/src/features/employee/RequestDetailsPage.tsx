import { lazy, Suspense, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, FileText, Pencil, RotateCw, X } from 'lucide-react'
import { useRequestDetail } from '@/api/queries'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Card, CardTitle, StatTile } from '@/components/Card'
import { LeaveTypeTag } from '@/components/LeaveTypeTag'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/States'
import { StatusBadge } from '@/components/StatusBadge'
import { StickyBar } from '@/components/StickyBar'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useSubPage } from '@/layouts/subPage'
import { formatDate, formatRange } from '@/lib/dates'
import { formatBytes, fullName } from '@/lib/format'
import { statusStyles } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'
import { CancelDialog } from './CancelDialog'
import { useCancelRequest } from './hooks'
import type { EmployeeList } from './RequestCard'

const AttachmentPreview = lazy(() => import('./AttachmentPreview'))

const LISTS: Record<EmployeeList, { label: string; to: string }> = {
  me: { label: 'My leave', to: '/me' },
  history: { label: 'History', to: '/me/history' },
}

/** Single-step flow: employee → HR. Separate page, not a modal. */
export function RequestDetailsPage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const detail = useRequestDetail(id)
  const cancel = useCancelRequest()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const fromState = (location.state as { from?: EmployeeList } | null)?.from
  const list = LISTS[fromState ?? (detail.data?.request.status === 'pending' ? 'me' : 'history')]
  useSubPage(`Request ${id}`, list.to)

  if (detail.isPending) return <Skeleton className="h-[480px] rounded-card" />
  if (detail.error) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />

  const { request: r, decider } = detail.data
  const range = formatRange(r.startDate, r.endDate)
  const editLink = `/me/request/new?edit=${r.id}`
  const againLink = `/me/request/new?from=${r.id}`

  const decisionLine = (
    <p className="text-[13.5px] text-muted-foreground">
      Decision:{' '}
      <strong className="font-semibold text-foreground">
        {r.status === 'pending' ? 'Waiting for HR' : `${r.decidedAt ? formatDate(r.decidedAt) : ''}${decider ? ` by ${fullName(decider)}` : ''}`}
      </strong>
    </p>
  )

  const hrResponse = r.status !== 'pending' && (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2.5">
        {decider && <Avatar name={fullName(decider)} src={decider.avatarUrl} size={32} />}
        <p className="flex-1 text-sm"><span className="font-semibold">HR response</span>{decider && ` · ${fullName(decider)}`}</p>
        {r.decidedAt && <span className="text-xs text-muted-foreground">{formatDate(r.decidedAt)}</span>}
      </div>
      <p className={cn('rounded-tile p-3 text-sm', statusStyles[r.status].tint)}>
        {r.decisionNote || (r.status === 'approved' ? 'Approved without a note.' : 'Rejected without a note.')}
      </p>
    </Card>
  )

  const message = (
    <Card className="flex flex-col gap-2 p-5">
      <CardTitle>Your message</CardTitle>
      <p className="text-sm whitespace-pre-line">{r.reason || <span className="text-muted-foreground">No message.</span>}</p>
    </Card>
  )

  const doCancel = () => cancel.mutate(r.id, { onSuccess: () => navigate('/me'), onSettled: () => setConfirmCancel(false) })
  const cancelDialog = <CancelDialog request={confirmCancel ? r : null} busy={cancel.isPending} onClose={() => setConfirmCancel(false)} onConfirm={doCancel} />

  if (isMobile) {
    return (
      <>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted-foreground">{r.type} leave</p>
            <h1 className="text-[22px] font-bold tracking-[-0.02em]">{range}</h1>
          </div>
          <StatusBadge status={r.status} className="mt-1" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Leave type" value={<LeaveTypeTag type={r.type} className="text-sm" />} />
          <StatTile label="Working days" value={r.workingDays} />
          <StatTile label="Submitted" value={<span className="text-sm">{formatDate(r.submittedAt)}</span>} />
          <StatTile label="Decision" value={<span className="text-sm">{r.status === 'pending' ? 'Waiting for HR' : r.decidedAt && formatDate(r.decidedAt)}</span>} />
        </div>
        {message}
        {hrResponse}
        {r.attachment && (
          <button type="button" onClick={() => setPreviewOpen(true)}
            className="flex items-center gap-3 rounded-card border bg-surface p-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <span className="flex size-12 items-center justify-center rounded-tile bg-sunk"><FileText className="size-6 text-muted-foreground" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{r.attachment.name}</span>
              <span className="block text-[13px] text-muted-foreground">
                {r.attachment.mime === 'application/pdf' ? 'PDF' : 'Image'} · {formatBytes(r.attachment.sizeBytes)} · tap to open
              </span>
            </span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
          </button>
        )}
        {r.status === 'pending' && (
          <StickyBar className="grid-cols-2">
            <Button icon={X} label="Cancel" variant="danger" size="sticky" onClick={() => setConfirmCancel(true)} />
            <Button icon={Pencil} label="Edit" size="sticky" to={editLink} />
          </StickyBar>
        )}
        {r.status === 'rejected' && (
          <StickyBar><Button icon={RotateCw} label="Request again" variant="primary" size="sticky" to={againLink} /></StickyBar>
        )}
        {r.attachment && (
          <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
            <DialogContent className="flex h-svh max-w-none flex-col gap-0 rounded-none p-0 sm:max-w-none" showCloseButton={false}>
              <DialogTitle className="sr-only">{r.attachment.name}</DialogTitle>
              <div className="flex items-center justify-end border-b bg-header p-2">
                <Button shape="icon" icon={X} label="Close preview" variant="ghost" onClick={() => setPreviewOpen(false)} />
              </div>
              <Suspense fallback={<Skeleton className="m-4 flex-1" />}>
                <AttachmentPreview attachment={r.attachment} className="flex-1 rounded-none border-0" />
              </Suspense>
            </DialogContent>
          </Dialog>
        )}
        {cancelDialog}
      </>
    )
  }

  return (
    <>
      <PageHeader
        back={{ to: list.to, label: `Back to ${list.label}` }}
        breadcrumb={[{ label: list.label, to: list.to }, { label: `Request ${r.id}` }]}
        title={`${r.type} leave, ${range}`}
      />
      <div className="flex items-start gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Card className="flex flex-col gap-4 p-5">
            <CardTitle>Request details</CardTitle>
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Leave type" value={<LeaveTypeTag type={r.type} className="text-sm" />} />
              <StatTile label="Working days" value={r.workingDays} />
              <StatTile label="Status" value={<StatusBadge status={r.status} />} />
              <StatTile label="From" value={<span className="text-sm">{formatDate(r.startDate)}</span>} />
              <StatTile label="To" value={<span className="text-sm">{formatDate(r.endDate)}</span>} />
              <StatTile label="Submitted" value={<span className="text-sm">{formatDate(r.submittedAt)}</span>} />
            </div>
            {decisionLine}
          </Card>
          {message}
          {hrResponse}
          {r.status === 'pending' && (
            <div className="flex items-center gap-2">
              <p className="mr-auto text-[13px] text-muted-foreground">You can edit or cancel until HR decides.</p>
              <Button icon={X} label="Cancel request" variant="danger" onClick={() => setConfirmCancel(true)} />
              <Button icon={Pencil} label="Edit request" to={editLink} />
            </div>
          )}
          {r.status === 'rejected' && (
            <div className="flex items-center gap-2">
              <p className="mr-auto text-[13px] text-muted-foreground">Rejected requests use no leave days.</p>
              <Button icon={RotateCw} label="Request again" variant="primary" to={againLink} />
            </div>
          )}
        </div>
        {r.attachment && (
          <Suspense fallback={<Skeleton className="h-[560px] w-[540px] rounded-card" />}>
            <AttachmentPreview attachment={r.attachment} className="w-[540px] shrink-0" />
          </Suspense>
        )}
      </div>
      {cancelDialog}
    </>
  )
}
