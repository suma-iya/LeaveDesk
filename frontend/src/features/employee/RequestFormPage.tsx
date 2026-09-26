import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { eachDayOfInterval, parseISO, startOfMonth } from 'date-fns'
import { Send, X } from 'lucide-react'
import { api } from '@/api'
import { keys, useRequestDetail } from '@/api/queries'
import { Alert } from '@/components/Alert'
import { AppButton } from '@/components/AppButton'
import { Card } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/States'
import { StickyBar } from '@/components/StickyBar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useUser } from '@/features/auth/AuthProvider'
import { formatDateWithWeekday, formatRange, toISODate } from '@/lib/dates'
import { LEAVE_TYPES, TYPE_LABEL, available, overlaps, pluralDays, workingDays } from '@/lib/leave'
import { typeStyles } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'
import type { FileMeta, LeaveRequest, LeaveType } from '@/types'
import { AttachmentField } from './AttachmentField'
import { useMyRequests, useSaveRequest } from './hooks'
import { MonthPicker } from './MonthPicker'
import { TypePicker } from './TypePicker'

/**
 * /me/request/new           a new request (both roles)
 * /me/request/new?edit=ID   edit a pending request
 * /me/request/new?from=ID   "Request again": type, reason and attachment pre-filled
 */
export function RequestFormPage() {
  const [params] = useSearchParams()
  const editId = params.get('edit') ?? undefined
  const fromId = params.get('from') ?? undefined
  const source = useRequestDetail(editId ?? fromId)

  if ((editId || fromId) && source.isPending) return <Skeleton className="h-[560px] rounded-card" />
  if (source.error) return <ErrorState error={source.error} onRetry={() => source.refetch()} />
  const request = source.data?.request
  return <RequestForm key={editId ?? fromId ?? 'new'} editing={editId ? request : undefined} copyFrom={fromId ? request : undefined} />
}

function RequestForm({ editing, copyFrom }: { editing?: LeaveRequest; copyFrom?: LeaveRequest }) {
  const user = useUser()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const prefill = editing ?? copyFrom
  // The picker shows only this person's own leave (never teammates').
  const mineData = useMyRequests({ status: ['pending', 'approved'], pageSize: 100 }).data
  const mine = useMemo(() => mineData?.items ?? [], [mineData])
  const save = useSaveRequest(editing?.id)

  const [month, setMonth] = useState(() => startOfMonth(editing ? parseISO(editing.startDate) : new Date()))
  const [start, setStart] = useState<string | null>(editing?.startDate ?? null)
  const [end, setEnd] = useState<string | null>(editing?.endDate ?? null)
  const [pickingEnd, setPickingEnd] = useState(false)
  const [type, setType] = useState<LeaveType>(prefill?.type ?? 'annual')
  const [reason, setReason] = useState(prefill?.reason ?? '')
  const [attachment, setAttachment] = useState<FileMeta | null>(prefill?.attachment ?? null)

  const year = start ? Number(start.slice(0, 4)) : month.getFullYear()
  const balances = useQuery({ queryKey: keys.balances(year), queryFn: () => api.me.balances(year) }).data

  const home = user.role === 'hr' ? '/hr/requests?status=all&mine=1' : '/me'
  const backTo = editing ? (user.role === 'hr' ? `/hr/requests/${editing.id}` : `/me/requests/${editing.id}`) : home

  // First click sets start = end; second click sets the end; a click before
  // the start begins a new selection.
  const pick = (day: string) => {
    if (!pickingEnd || !start || day < start) {
      setStart(day); setEnd(day); setPickingEnd(true)
    } else {
      setEnd(day); setPickingEnd(false)
    }
  }

  // An edited request already counts as pending: give its days back.
  const availableByType = useMemo(() => Object.fromEntries(LEAVE_TYPES.map((t) => {
    const b = balances?.find((x) => x.type === t)
    const refund = editing && editing.type === t && editing.startDate.startsWith(String(year)) ? editing.workingDays : 0
    return [t, b ? available(b) + refund : 0]
  })) as Record<LeaveType, number>, [balances, editing, year])

  const others = useMemo(() => mine.filter((r) => r.id !== editing?.id), [mine, editing])
  const pendingDays = useMemo(() => new Set(others.filter((r) => r.status === 'pending')
    .flatMap((r) => eachDayOfInterval({ start: parseISO(r.startDate), end: parseISO(r.endDate) }).map(toISODate))), [others])

  const days = start && end ? workingDays(start, end) : 0
  const availableNow = availableByType[type]
  const leftAfter = availableNow - days

  // The same checks and wording as the server (internal/leave/rules.go).
  const errors: string[] = []
  if (start && end) {
    const clash = others.find((r) => overlaps(r, { startDate: start, endDate: end }))
    if (days === 0) errors.push('Pick at least one working day. Fridays and Saturdays are weekends.')
    else if (clash) errors.push(`These dates overlap your ${clash.status} request (${formatRange(clash.startDate, clash.endDate)}).`)
    else if (balances && days > availableNow) errors.push(`Not enough ${TYPE_LABEL[type]} leave: ${pluralDays(Math.max(availableNow, 0))} available, ${days} requested.`)
  }
  const serverError = save.error?.message
  const canSubmit = Boolean(start && end && balances) && errors.length === 0 && !save.isPending

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!start || !end || !canSubmit) return
    save.mutate({ type, startDate: start, endDate: end, reason, attachmentFileId: attachment?.id ?? null },
      { onSuccess: () => navigate(home) })
  }

  const picker = (
    <MonthPicker month={month} onMonthChange={setMonth} start={start} end={end} onPick={pick}
      pickingEnd={pickingEnd} pendingDays={pendingDays} compact={isMobile} />
  )
  const summary = (
    <div className={cn('flex flex-col gap-2 rounded-tile border-l-[3px] bg-sunk p-4', typeStyles[type].borderLeft)}>
      <p className="flex items-baseline gap-2">
        <span className="text-[28px] leading-none font-bold">{days}</span>
        <span className="text-[13px] text-muted-foreground">working {days === 1 ? 'day' : 'days'} of {TYPE_LABEL[type]} leave</span>
      </p>
      <p className="flex gap-4 text-[13px] text-muted-foreground">
        <span>Available now <strong className="font-semibold text-foreground">{availableNow}</strong></span>
        <span>Left after this <strong className={cn('font-semibold', leftAfter < 0 ? 'text-danger' : 'text-foreground')}>{leftAfter}</strong></span>
      </p>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface" aria-hidden>
        <div className={cn('h-full rounded-full', typeStyles[type].bg)}
          style={{ width: `${availableNow > 0 ? Math.min(100, (days / availableNow) * 100) : days > 0 ? 100 : 0}%` }} />
      </div>
    </div>
  )
  const problems = (errors.length > 0 || serverError) && (
    <Alert tone="error"><ul className="flex flex-col gap-1">{[...errors, ...(serverError ? [serverError] : [])].map((e) => <li key={e}>{e}</li>)}</ul></Alert>
  )
  const details = (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Reason</Label>
        <Textarea id="reason" value={reason} maxLength={1000} onChange={(e) => setReason(e.target.value)} className="min-h-20" />
      </div>
      <AttachmentField value={attachment} onChange={setAttachment} />
    </>
  )
  const submitLabel = editing ? 'Save changes' : 'Submit request'

  return (
    <form onSubmit={submit} className="contents">
      <PageHeader
        back={{ to: backTo, label: 'Back' }}
        breadcrumb={[
          user.role === 'hr' ? { label: 'All', to: home } : { label: 'My leave', to: '/me' },
          { label: editing ? 'Edit request' : 'New request' },
        ]}
        title={editing ? 'Edit request' : 'Request leave'}
      />
      {isMobile ? (
        <div className="flex flex-col gap-4">
          <TypePicker value={type} onChange={setType} availableByType={availableByType} />
          <Card className="p-3">{picker}</Card>
          <p className="text-[13px] text-muted-foreground">
            From <strong className="font-semibold text-foreground">{start ? formatDateWithWeekday(start) : '—'}</strong>
            {' '}to <strong className="font-semibold text-foreground">{end ? formatDateWithWeekday(end) : '—'}</strong>
          </p>
          {summary}
          {problems}
          {details}
          <StickyBar>
            <AppButton type="submit" icon={Send} label={submitLabel} variant="primary" size="sticky" loading={save.isPending} disabled={!canSubmit} />
          </StickyBar>
        </div>
      ) : (
        <div className="flex items-start gap-5">
          <Card className="w-[560px] shrink-0 p-5">{picker}</Card>
          <Card className="flex min-w-0 flex-1 flex-col gap-4 p-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Leave type</span>
              <TypePicker value={type} onChange={setType} availableByType={availableByType} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ReadOnlyDate id="from" label="From" value={start} />
              <ReadOnlyDate id="to" label="To" value={end} />
            </div>
            {summary}
            {problems}
            {details}
            <div className="flex justify-end gap-2 border-t pt-4">
              <AppButton icon={X} label="Cancel" to={backTo} />
              <AppButton type="submit" icon={Send} label={submitLabel} variant="primary" loading={save.isPending} disabled={!canSubmit} />
            </div>
          </Card>
        </div>
      )}
    </form>
  )
}

function ReadOnlyDate({ id, label, value }: { id: string; label: string; value: string | null }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} readOnly value={value ? formatDateWithWeekday(value) : ''} placeholder="Pick on the calendar" className="h-9 bg-sunk" />
    </div>
  )
}
