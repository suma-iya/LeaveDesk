import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { eachDayOfInterval, parseISO, startOfMonth } from 'date-fns'
import { Send, X } from 'lucide-react'
import { useBalances, usePolicy, useRequestDetail } from '@/api/queries'
import { Alert } from '@/components/Alert'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/States'
import { StickyBar } from '@/components/StickyBar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useUser } from '@/features/auth/AuthProvider'
import { useSubPage } from '@/layouts/subPage'
import { formatDateWithWeekday, formatRange, toISODate } from '@/lib/dates'
import { DEFAULT_WEEKEND, LEAVE_TYPES, available, overlaps, pluralDays, workingDays } from '@/lib/leave'
import { typeStyles } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'
import type { LeaveRequest, LeaveType } from '@/types'
import { AttachmentField } from './AttachmentField'
import { useMyRequests, useSaveRequest } from './hooks'
import { MonthPicker } from './MonthPicker'
import { TypePicker } from './TypePicker'

/**
 * /me/request/new           new request
 * /me/request/new?edit=ID   edit a pending request
 * /me/request/new?from=ID   "Request again": type, reason and attachment pre-filled
 */
export function RequestLeavePage() {
  const [params] = useSearchParams()
  const editId = params.get('edit') ?? undefined
  const fromId = params.get('from') ?? undefined
  const source = useRequestDetail(editId ?? fromId)

  if ((editId || fromId) && source.isPending) return <Skeleton className="h-[560px] rounded-card" />
  if (source.error) return <ErrorState error={source.error} onRetry={() => source.refetch()} />
  return <RequestForm key={editId ?? fromId ?? 'new'} editing={editId ? source.data?.request : undefined} copyFrom={fromId ? source.data?.request : undefined} />
}

function RequestForm({ editing, copyFrom }: { editing?: LeaveRequest; copyFrom?: LeaveRequest }) {
  const user = useUser()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const policy = usePolicy().data
  const weekendDays = policy?.weekendDays ?? DEFAULT_WEEKEND
  const mine = useMyRequests({ status: ['pending', 'approved'] }).data ?? []
  const save = useSaveRequest(editing?.id)
  const prefill = editing ?? copyFrom

  const [month, setMonth] = useState(() => startOfMonth(editing ? parseISO(editing.startDate) : new Date()))
  const [start, setStart] = useState<string | null>(editing?.startDate ?? null)
  const [end, setEnd] = useState<string | null>(editing?.endDate ?? null)
  const [pickingEnd, setPickingEnd] = useState(false)
  const [type, setType] = useState<LeaveType>(prefill?.type ?? 'Annual')
  const [reason, setReason] = useState(prefill?.reason ?? '')
  const [attachment, setAttachment] = useState(prefill?.attachment)

  const year = start ? Number(start.slice(0, 4)) : month.getFullYear()
  const balances = useBalances(user.id, year).data

  const backTo = editing ? `/me/requests/${editing.id}` : '/me'
  useSubPage(editing ? 'Edit request' : 'Request leave', backTo)

  // Picking: first click sets start = end; second click sets the end;
  // clicking before the start begins a new selection.
  const pick = (day: string) => {
    if (!pickingEnd || !start || day < start) {
      setStart(day); setEnd(day); setPickingEnd(true)
    } else {
      setEnd(day); setPickingEnd(false)
    }
  }

  // The request being edited is already counted as pending; give its days back.
  const availableByType = useMemo(() => Object.fromEntries(LEAVE_TYPES.map((t) => {
    const balance = balances?.find((b) => b.type === t)
    const refund = editing && editing.type === t && editing.startDate.startsWith(String(year)) ? editing.workingDays : 0
    return [t, balance ? available(balance) + refund : 0]
  })) as Record<LeaveType, number>, [balances, editing, year])

  const others = mine.map((row) => row.request).filter((r) => r.id !== editing?.id)
  const pendingDays = useMemo(() => new Set(others.filter((r) => r.status === 'pending')
    .flatMap((r) => eachDayOfInterval({ start: parseISO(r.startDate), end: parseISO(r.endDate) }).map(toISODate))), [others])

  const days = start && end ? workingDays(start, end, weekendDays) : 0
  const availableNow = availableByType[type]
  const leftAfter = availableNow - days

  const errors: string[] = []
  if (start && end) {
    const clash = others.find((r) => overlaps(r, { startDate: start, endDate: end }))
    if (clash) errors.push(`These dates overlap your ${clash.status} request ${clash.id} (${formatRange(clash.startDate, clash.endDate)}).`)
    if (days === 0) errors.push('Pick at least one working day. Fridays and Saturdays are weekends.')
    else if (balances && days > availableNow) errors.push(`Not enough ${type} leave: ${pluralDays(availableNow)} available, ${days} requested.`)
  }
  if (save.error) errors.push(save.error.message)

  const canSubmit = Boolean(start && end && balances) && errors.length === (save.error ? 1 : 0) && !save.isPending

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!start || !end || !canSubmit) return
    save.reset()
    save.mutate({ type, startDate: start, endDate: end, reason, attachment }, { onSuccess: () => navigate('/me') })
  }

  const picker = (
    <MonthPicker month={month} onMonthChange={setMonth} start={start} end={end} onPick={pick}
      pickingEnd={pickingEnd} pendingDays={pendingDays} weekendDays={weekendDays} compact={isMobile} />
  )
  const summary = (
    <div className={cn('flex flex-col gap-2 rounded-tile border-l-[3px] bg-sunk p-4', typeStyles[type].borderLeft)}>
      <p className="flex items-baseline gap-2">
        <span className="text-[28px] leading-none font-bold">{days}</span>
        <span className="text-[13px] text-muted-foreground">working {days === 1 ? 'day' : 'days'} of {type} leave</span>
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
  const problems = errors.length > 0 && (
    <Alert tone="error"><ul className="flex flex-col gap-1">{errors.map((e) => <li key={e}>{e}</li>)}</ul></Alert>
  )
  const details = (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reason">Reason</Label>
        <Textarea id="reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}
          placeholder="A short note for your manager" className="min-h-20" />
      </div>
      <AttachmentField value={attachment} onChange={setAttachment} />
    </>
  )

  return (
    <form onSubmit={submit} className="contents">
      <PageHeader
        back={{ to: backTo, label: 'Back' }}
        breadcrumb={[{ label: 'My leave', to: '/me' }, { label: editing ? `Edit ${editing.id}` : 'New request' }]}
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
            <Button type="submit" icon={Send} label={editing ? 'Save changes' : 'Submit request'} variant="primary" size="sticky"
              loading={save.isPending} disabled={!canSubmit} />
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
              <Button icon={X} label="Cancel" to={backTo} />
              <Button type="submit" icon={Send} label={editing ? 'Save changes' : 'Submit request'} variant="primary"
                loading={save.isPending} disabled={!canSubmit} />
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
      <Input id={id} readOnly value={value ? formatDateWithWeekday(value) : ''} placeholder="Pick on the calendar"
        className="h-9 bg-sunk" />
    </div>
  )
}
