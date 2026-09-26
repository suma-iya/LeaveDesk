import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Briefcase, Cake, CalendarDays, Check, Info, Mail, RotateCcw, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { keys, refreshLeaveData, useDepartments } from '@/api/queries'
import { Alert } from '@/components/Alert'
import { AppButton, IconButton } from '@/components/AppButton'
import { Avatar } from '@/components/Avatar'
import { Card, CardTitle } from '@/components/Card'
import { InfoRow } from '@/components/InfoRow'
import { LeaveTypeTag } from '@/components/LeaveTypeTag'
import { PageHeader } from '@/components/PageHeader'
import { ErrorState } from '@/components/States'
import { StackedBar } from '@/components/StackedBar'
import { StatusBadge } from '@/components/StatusBadge'
import { StickyBar } from '@/components/StickyBar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useUser } from '@/features/auth/AuthProvider'
import { yearlySegments } from '@/features/employee/BalanceCards'
import { formatDate, formatRange } from '@/lib/dates'
import { formatBDT, fullName, tenure } from '@/lib/format'
import { LEAVE_TYPES, TYPE_LABEL, sumBalances } from '@/lib/leave'
import { inputHeight } from '@/lib/styles'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'
import type { EmployeeChange, EmployeeDetail, LeaveType } from '@/types'

export function EmployeePage() {
  const { id = '' } = useParams()
  const detail = useQuery({ queryKey: keys.employee(id), queryFn: () => api.hr.employee(id) })
  if (detail.isPending) return <Skeleton className="h-[560px] rounded-card" />
  if (detail.error) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
  // Re-mount the form after each save so it starts from the saved values.
  return <EmployeeForm key={JSON.stringify(detail.data)} detail={detail.data} />
}

const NEW_DEPARTMENT = '__new__'

function initial(d: EmployeeDetail) {
  return {
    department: d.employee.department ? String(d.employee.department.id) : '',
    monthly: d.salary.current ? String(d.salary.current.monthlyBdt) : '',
    effectiveFrom: '',
    limits: Object.fromEntries(d.balances.map((b) => [b.type, String(b.limit)])) as Record<LeaveType, string>,
  }
}

function EmployeeForm({ detail }: { detail: EmployeeDetail }) {
  const me = useUser()
  const client = useQueryClient()
  const isMobile = useIsMobile()
  const departments = useDepartments().data ?? []
  const [form, setForm] = useState(() => initial(detail))
  const [newDepartment, setNewDepartment] = useState<string | null>(null)
  const { employee: e, balances, year } = detail
  const self = e.id === me.id
  const start = initial(detail)

  // ---- validation, mirrored from the server ----
  const limitErrors = Object.fromEntries(balances.map((b) => {
    const raw = form.limits[b.type]
    const value = Number(raw)
    const floor = b.used + b.pending
    const error = raw === '' || !Number.isInteger(value) || value < 0 ? 'Enter a whole number.'
      : value < floor ? `Can't be below ${floor}: ${b.used} used, ${b.pending} pending` : ''
    return [b.type, error]
  })) as Record<LeaveType, string>
  const salaryChanged = form.monthly !== start.monthly || form.effectiveFrom !== ''
  const salaryError = !salaryChanged ? ''
    : !/^\d+$/.test(form.monthly) || Number(form.monthly) <= 0 ? 'Enter the monthly salary in whole taka.'
    : !form.effectiveFrom ? 'Enter the date the new salary applies from.' : ''
  const limitsChanged = LEAVE_TYPES.some((t) => form.limits[t] !== start.limits[t])
  const deptChanged = form.department !== start.department && form.department !== ''
  const dirty = deptChanged || salaryChanged || limitsChanged
  const invalid = Boolean(salaryError) || (limitsChanged && Object.values(limitErrors).some(Boolean))

  const save = useMutation({
    mutationFn: () => {
      const change: EmployeeChange = {}
      if (deptChanged) change.departmentId = Number(form.department)
      if (salaryChanged) change.salary = { monthlyBdt: Number(form.monthly), effectiveFrom: form.effectiveFrom }
      if (limitsChanged) change.limits = Object.fromEntries(LEAVE_TYPES.map((t) => [t, Number(form.limits[t])])) as Record<LeaveType, number>
      return api.hr.updateEmployee(e.id, change)
    },
    onSuccess: (updated) => {
      client.setQueryData(keys.employee(e.id), updated)
      void refreshLeaveData(client)
      toast.success(`${fullName(e)} updated`)
    },
  })

  const createDepartment = useMutation({
    mutationFn: (name: string) => api.hr.createDepartment(name),
    onSuccess: async (d) => {
      await client.invalidateQueries({ queryKey: keys.departments })
      setForm((f) => ({ ...f, department: String(d.id) }))
      setNewDepartment(null)
      toast.success(`Department ${d.name} created`)
    },
  })

  const total = LEAVE_TYPES.reduce((n, t) => n + (Number(form.limits[t]) || 0), 0)
  const totals = sumBalances(balances)

  const departmentCard = (
    <Card className="flex flex-col gap-3 p-5">
      <CardTitle>Department</CardTitle>
      {newDepartment === null ? (
        <Select value={form.department || undefined} onValueChange={(v) => (v === NEW_DEPARTMENT ? setNewDepartment('') : setForm((f) => ({ ...f, department: v })))}>
          <SelectTrigger aria-label="Department" className={cn('w-full rounded-md bg-surface', inputHeight)}><SelectValue placeholder="Choose department" /></SelectTrigger>
          <SelectContent>
            {departments.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
            <SelectSeparator />
            <SelectItem value={NEW_DEPARTMENT}>+ New department</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <form className="flex items-center gap-2" onSubmit={(ev) => { ev.preventDefault(); createDepartment.mutate(newDepartment) }}>
          <Input autoFocus aria-label="New department name" placeholder="New department name" value={newDepartment}
            onChange={(ev) => setNewDepartment(ev.target.value)} className={cn('flex-1', inputHeight)} />
          <IconButton icon={X} label="Cancel new department" variant="ghost" onClick={() => { setNewDepartment(null); createDepartment.reset() }} />
          <IconButton type="submit" icon={Check} label="Create department" variant="ghost" loading={createDepartment.isPending} disabled={newDepartment.trim().length < 2} />
        </form>
      )}
      {createDepartment.error && <p className="text-xs text-danger">{createDepartment.error.message}</p>}
    </Card>
  )

  const salaryCard = (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <CardTitle>Salary</CardTitle>
        <span className="text-xs text-muted-foreground">Visible to HR only</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="monthly">Monthly (BDT)</Label>
          <Input id="monthly" inputMode="numeric" value={form.monthly} disabled={self}
            onChange={(ev) => setForm((f) => ({ ...f, monthly: ev.target.value.replace(/[^\d]/g, '') }))} className={inputHeight} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="effective">Effective from</Label>
          <Input id="effective" type="date" value={form.effectiveFrom} disabled={self}
            onChange={(ev) => setForm((f) => ({ ...f, effectiveFrom: ev.target.value }))} className={inputHeight} />
        </div>
      </div>
      {salaryError && <p className="text-xs text-danger">{salaryError}</p>}
      <div>
        <p className="mb-1 text-xs font-semibold text-muted-foreground">History</p>
        {detail.salary.history.length === 0 ? <p className="text-sm text-muted-foreground">No salary recorded yet.</p> : (
          <ul className="divide-y rounded-tile border text-[13.5px]">
            {detail.salary.history.map((s, i) => (
              <li key={`${s.effectiveFrom}-${i}`} className="flex justify-between px-3 py-2">
                <span className="font-medium">{formatBDT(s.monthlyBdt)}</span>
                <span className="text-muted-foreground">from {formatDate(s.effectiveFrom)}{i === 0 && ' · current'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )

  const limitsCard = (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <CardTitle>Leave limits {year}</CardTitle>
        <AppButton icon={RotateCcw} label="Use defaults" variant="ghost" disabled={self}
          onClick={() => setForm((f) => ({ ...f, limits: Object.fromEntries(LEAVE_TYPES.map((t) => [t, String(detail.defaults[t])])) as Record<LeaveType, string> }))} />
      </div>
      {balances.map((b) => (
        <div key={b.type} className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Label htmlFor={`limit-${b.type}`} className="w-24"><LeaveTypeTag type={b.type} /></Label>
            <Input id={`limit-${b.type}`} inputMode="numeric" value={form.limits[b.type]} disabled={self} aria-invalid={Boolean(limitErrors[b.type])}
              onChange={(ev) => setForm((f) => ({ ...f, limits: { ...f.limits, [b.type]: ev.target.value.replace(/[^\d]/g, '') } }))}
              className={cn('w-20', inputHeight)} />
            <span className="text-xs text-muted-foreground">{b.used} used · {b.pending} pending · minimum {b.used + b.pending}</span>
          </div>
          {limitErrors[b.type] && <p className="pl-27 text-xs text-danger">{limitErrors[b.type]}</p>}
        </div>
      ))}
      <p className="border-t pt-3 text-sm">Total <strong className="font-semibold">{total} days</strong> <span className="text-muted-foreground">(default {LEAVE_TYPES.reduce((n, t) => n + detail.defaults[t], 0)})</span></p>
    </Card>
  )

  const profileCard = (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-4">
        <Avatar name={fullName(e)} src={e.avatarUrl} size={64} />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-bold">{fullName(e)}</p>
          <p className="text-[13px] text-muted-foreground">{e.role === 'hr' ? 'HR' : 'Employee'}</p>
        </div>
      </div>
      <div>
        <InfoRow icon={Mail} label="Email" value={e.email} />
        <InfoRow icon={Cake} label="Age" value={e.age} />
        <InfoRow icon={CalendarDays} label="Date of birth" value={formatDate(e.dateOfBirth)} />
        <InfoRow icon={Briefcase} label="Joined" value={e.joinedOn ? `${formatDate(e.joinedOn)} · ${tenure(e.joinedOn)}` : '—'} />
      </div>
      <p className="rounded-tile bg-sunk p-3 text-xs text-muted-foreground">
        Name, email, date of birth and password belong to the employee. HR can't change them.
      </p>
    </Card>
  )

  const leaveCard = (
    <Card className="flex flex-col gap-3 p-5">
      <CardTitle>Leave this year</CardTitle>
      <p className="text-[13px] text-muted-foreground"><strong className="font-semibold text-foreground">{totals.used}</strong> of {totals.limit} days used · {totals.pending} pending</p>
      <StackedBar segments={yearlySegments(balances)} total={totals.limit} />
      <ul className="divide-y rounded-tile border">
        {detail.recentRequests.slice(0, 2).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[13.5px]">
            <span className="min-w-0">
              <span className="block truncate font-medium">{TYPE_LABEL[r.type]} · {formatRange(r.startDate, r.endDate)}</span>
              <span className="text-xs text-muted-foreground">{r.code} · {r.workingDays} working {r.workingDays === 1 ? 'day' : 'days'}</span>
            </span>
            <StatusBadge status={r.status} />
          </li>
        ))}
        {detail.recentRequests.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">No requests yet.</li>}
      </ul>
    </Card>
  )

  const actions = (
    <>
      <AppButton icon={RotateCcw} label="Discard" size={isMobile ? 'sticky' : undefined} disabled={!dirty || save.isPending}
        onClick={() => { setForm(initial(detail)); save.reset() }} />
      <AppButton icon={Save} label="Save changes" variant="primary" size={isMobile ? 'sticky' : undefined} loading={save.isPending}
        disabled={!dirty || invalid} onClick={() => save.mutate()} />
    </>
  )

  return (
    <>
      <PageHeader
        back={{ to: '/hr/people', label: 'Back to Employees' }}
        breadcrumb={[{ label: 'People', to: '/hr/people' }, { label: fullName(e) }]}
        title={fullName(e)}
        subtitle={e.department?.name ?? 'No department'}
        actions={!isMobile && actions}
      />
      {self && <Alert tone="warning"><span className="flex items-center gap-2"><Info className="size-4" aria-hidden />Another HR must change your own salary or leave limits.</span></Alert>}
      {save.error && <Alert tone="error">{save.error.message}</Alert>}
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-5">{departmentCard}{salaryCard}{limitsCard}</div>
        <div className="flex flex-col gap-5">{profileCard}{leaveCard}</div>
      </div>
      {isMobile && <StickyBar className="grid-cols-2">{actions}</StickyBar>}
    </>
  )
}
