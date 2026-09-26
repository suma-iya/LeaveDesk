import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createColumnHelper } from '@tanstack/react-table'
import { Check, ChevronRight, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/api'
import { keys, useDepartments } from '@/api/queries'
import { AppButton } from '@/components/AppButton'
import { Avatar } from '@/components/Avatar'
import { Card, CardTitle } from '@/components/Card'
import { DataTable } from '@/components/DataTable'
import { FilterSelect } from '@/components/Filters'
import type { FilterDef } from '@/components/Filters'
import { PageHeader } from '@/components/PageHeader'
import { HeaderActions } from '@/layouts/HeaderActions'
import { formatDate } from '@/lib/dates'
import { ALL, optionsFrom } from '@/lib/filters'
import { fullName } from '@/lib/format'
import { useDebounced } from '@/lib/useDebounced'
import { usePaging } from '@/lib/usePaging'
import { cn } from '@/lib/utils'
import type { EmployeeRow, User } from '@/types'

const col = createColumnHelper<EmployeeRow>()
const personLink = (u: { id: string }) => `/hr/people/${u.id}`

/** "8 of 22 days · 14 left" with a bar. Left excludes pending days. */
function LeaveThisYear({ row, className }: { row: EmployeeRow; className?: string }) {
  const { used, limit } = row.yearly
  const left = Math.max(0, limit - used)
  return (
    <div className={cn('w-40', className)}>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-semibold">{used} of {limit} days</span>
        <span className={left <= 4 ? 'font-semibold text-pending' : 'text-muted-foreground'}>{left} left</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunk" aria-hidden>
        <div className={cn('h-full rounded-full', left <= 4 ? 'bg-pending' : 'bg-highlight')} style={{ width: `${limit ? Math.min(100, (used / limit) * 100) : 0}%` }} />
      </div>
    </div>
  )
}

export function PeoplePage() {
  const departments = useDepartments().data ?? []
  const [q, setQ] = useState('')
  const [department, setDepartment] = useState(ALL)
  const search = useDebounced(q)
  const f = { q: search || undefined, department: department === ALL ? undefined : Number(department) }
  const paging = usePaging(JSON.stringify(f))
  const list = { ...f, page: paging.page, pageSize: paging.pageSize }
  const rows = useQuery({ queryKey: [...keys.employees, list], queryFn: () => api.hr.employees(list), placeholderData: (p) => p })

  const filters: FilterDef[] = [
    { kind: 'search', id: 'q', placeholder: 'Search name or email', value: q, onChange: setQ },
    { kind: 'select', id: 'department', label: 'Department', value: department, defaultValue: ALL,
      options: optionsFrom('All departments', departments.map((d) => ({ value: String(d.id), label: d.name }))), onChange: setDepartment },
  ]

  const columns = useMemo(() => [
    col.accessor((u) => fullName(u), {
      id: 'employee', header: 'Employee',
      cell: ({ row }) => (
        <span className="flex items-center gap-3">
          <Avatar name={fullName(row.original)} src={row.original.avatarUrl} size={32} />
          <Link to={personLink(row.original)} className="font-semibold hover:underline">{fullName(row.original)}</Link>
        </span>
      ),
    }),
    col.accessor('email', { header: 'Email', cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span> }),
    col.accessor((u) => u.department?.name ?? '', { id: 'department', header: 'Department', cell: ({ getValue }) => getValue() || <span className="text-muted-foreground">—</span> }),
    col.accessor('age', { header: 'Age', meta: { className: 'tabular-nums' } }),
    col.display({ id: 'leave', header: 'Leave this year', cell: ({ row }) => <LeaveThisYear row={row.original} /> }),
    col.display({
      id: 'open', header: () => <span className="sr-only">Open</span>, meta: { className: 'w-12 text-right' },
      cell: ({ row }) => (
        <Link to={personLink(row.original)} aria-label={`Open ${fullName(row.original)}`} className="inline-flex rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      ),
    }),
  ], [])

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Click an employee to change their department, salary or leave limits."
        actions={<HeaderActions exportHref={api.hr.exportUrl(f)} />}
      />
      <NewRegistrations />
      <DataTable
        filters={filters}
        onReset={() => { setQ(''); setDepartment(ALL) }}
        columns={columns}
        rows={rows.data?.items}
        total={rows.data?.total ?? 0}
        page={paging.page}
        pageSize={paging.pageSize}
        onPageChange={paging.setPage}
        isLoading={rows.isPending}
        error={rows.error}
        onRetry={() => rows.refetch()}
        getRowId={(u) => u.id}
        emptyMessage="No employees match these filters."
        renderCard={(u) => (
          <Card>
            <Link to={personLink(u)} className="flex flex-col gap-3 rounded-card p-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <span className="flex items-center gap-3">
                <Avatar name={fullName(u)} src={u.avatarUrl} size={42} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{fullName(u)}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{u.department?.name ?? 'No department'} · age {u.age}</span>
                </span>
                <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
              </span>
              <LeaveThisYear row={u} className="w-full" />
            </Link>
          </Card>
        )}
      />
    </>
  )
}

/** Amber-bordered card of pending accounts: pick a department, then approve. */
function NewRegistrations() {
  const registrations = useQuery({ queryKey: keys.registrations, queryFn: api.hr.registrations })
  if (!registrations.data?.length) return null
  return (
    <Card className="border-l-[3px] border-l-pending">
      <div className="border-b px-4 py-3">
        <CardTitle>New registrations</CardTitle>
        <p className="text-[13px] text-muted-foreground">Choose a department to approve an account. The approval date becomes their joining date.</p>
      </div>
      <ul className="divide-y">
        {registrations.data.map((u) => <RegistrationRow key={u.id} user={u} />)}
      </ul>
    </Card>
  )
}

function RegistrationRow({ user }: { user: User }) {
  const client = useQueryClient()
  const departments = useDepartments().data ?? []
  const [department, setDepartment] = useState('')
  const refresh = () => Promise.all([keys.registrations, keys.employees].map((queryKey) => client.invalidateQueries({ queryKey })))

  const approve = useMutation({
    mutationFn: () => api.hr.approve(user.id, Number(department)),
    onSuccess: () => { toast.success(`${fullName(user)} approved`); return refresh() },
    onError: (e) => toast.error(e.message),
  })
  const reject = useMutation({
    mutationFn: () => api.hr.reject(user.id),
    onSuccess: () => { toast(`${fullName(user)}’s registration was rejected`); return refresh() },
    onError: (e) => toast.error(e.message),
  })

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Avatar name={fullName(user)} src={user.avatarUrl} size={36} />
      <div className="min-w-48 flex-1">
        <p className="font-semibold">{fullName(user)}</p>
        <p className="text-[13px] text-muted-foreground">{user.email}</p>
      </div>
      <p className="w-16 text-[13px] text-muted-foreground">Age {user.age}</p>
      <p className="w-36 text-[13px] text-muted-foreground">Registered {formatDate(user.createdAt.slice(0, 10))}</p>
      <FilterSelect className="h-9! w-[180px] max-md:h-11! max-md:w-full" filter={{
        kind: 'select', id: `dept-${user.id}`, label: `Department for ${fullName(user)}`, value: department || 'none', defaultValue: 'none',
        options: [{ value: 'none', label: 'Choose department' }, ...departments.map((d) => ({ value: String(d.id), label: d.name }))],
        onChange: (v) => setDepartment(v === 'none' ? '' : v),
      }} />
      <div className="flex gap-2 max-md:grid max-md:w-full max-md:grid-cols-2">
        <AppButton icon={X} label="Reject" variant="danger" loading={reject.isPending} disabled={approve.isPending} onClick={() => reject.mutate()} />
        <AppButton icon={Check} label="Approve" variant="ok" loading={approve.isPending} disabled={!department || reject.isPending} onClick={() => approve.mutate()} />
      </div>
    </li>
  )
}
