import { useState } from 'react'
import { addMonths, format, isSameMonth, startOfMonth } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useDepartments, usePolicy } from '@/api/queries'
import { Avatar } from '@/components/Avatar'
import { Button, IconButton } from '@/components/Button'
import { Card } from '@/components/Card'
import { FilterSelect } from '@/components/Filters'
import { PageHeader } from '@/components/PageHeader'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAuth } from '@/features/auth/AuthProvider'
import { downloadCsv } from '@/lib/csv'
import { formatDate, formatMonth, monthKey, toISODate } from '@/lib/dates'
import { ALL, optionsFrom } from '@/lib/filters'
import { fullName } from '@/lib/format'
import { DEFAULT_WEEKEND, LEAVE_TYPES, isWeekend } from '@/lib/leave'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'
import type { CalendarEntry, LeaveType } from '@/types'
import { HEAT_BG, awayOn, heatLevel, monthGrid } from './calendarDays'
import { DayPanel } from './DayPanel'
import { useCalendar } from './hooks'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Same page for HR and employees; only HR gets other people's balances. */
export function TeamCalendarPage() {
  const { role } = useAuth()
  const isMobile = useIsMobile()
  const weekendDays = usePolicy().data?.weekendDays ?? DEFAULT_WEEKEND
  const departments = useDepartments().data ?? []
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState(() => toISODate(new Date()))
  const [department, setDepartment] = useState(ALL)
  const [type, setType] = useState(ALL)
  const [includePending, setIncludePending] = useState(true)

  const calendar = useCalendar(monthKey(month), {
    department: department === ALL ? undefined : department,
    type: type === ALL ? undefined : (type as LeaveType),
    includePending,
  })
  const entries = calendar.data ?? []
  const days = monthGrid(month)

  const goToday = () => { setMonth(startOfMonth(new Date())); setSelected(toISODate(new Date())) }
  const exportMonth = () => downloadCsv(`team-calendar-${monthKey(month)}.csv`,
    ['Employee', 'Department', 'Leave type', 'From', 'To', 'Working days', 'Status'],
    entries.map(({ request: r, employee }) => [fullName(employee), employee.department, r.type, formatDate(r.startDate), formatDate(r.endDate), r.workingDays, r.status]))

  const pendingSwitch = (
    <div className="flex items-center gap-2">
      <Switch id="include-pending" checked={includePending} onCheckedChange={setIncludePending} />
      <Label htmlFor="include-pending" className="text-[13px] whitespace-nowrap">Include pending</Label>
    </div>
  )
  const monthNav = (
    <>
      <IconButton icon={ChevronLeft} label="Previous month" variant="secondary" onClick={() => setMonth((m) => addMonths(m, -1))} />
      <h2 className={cn('text-[17px] font-bold', isMobile && 'flex-1 text-center')} aria-live="polite">{formatMonth(month)}</h2>
      <IconButton icon={ChevronRight} label="Next month" variant="secondary" onClick={() => setMonth((m) => addMonths(m, 1))} />
    </>
  )
  const panel = (
    <DayPanel day={selected} people={isWeekend(selected, weekendDays) ? [] : awayOn(entries, selected)}
      weekendDays={weekendDays} showBalances={role === 'hr'} titleAside={isMobile ? pendingSwitch : undefined}
      className={isMobile ? '' : 'min-w-0 flex-1 self-start'} />
  )

  return (
    <>
      <PageHeader
        title="Team calendar"
        subtitle="Click any day to see who is away. Weekends (Fri, Sat) are not counted as leave days."
        actions={!isMobile && <Button icon={Download} label="Export CSV" disabled={!entries.length} onClick={exportMonth} />}
      />

      {isMobile ? (
        <>
          <Card className="flex flex-col gap-3 p-3">
            <div className="flex items-center gap-2">{monthNav}</div>
            <div className="grid grid-cols-7 gap-1" role="grid" aria-label={formatMonth(month)}>
              {WEEKDAYS.map((d, i) => <WeekdayHeader key={d} label={d} weekend={weekendDays.includes(i)} />)}
              {days.map((day) => (
                <CompactDay key={toISODate(day)} day={day} month={month} selected={selected} onSelect={setSelected}
                  people={awayOn(entries, toISODate(day))} weekend={isWeekend(day, weekendDays)} />
              ))}
            </div>
          </Card>
          {panel}
        </>
      ) : (
        <div className="flex gap-5">
          <Card className="w-[940px] shrink-0 p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {monthNav}
              <Button icon={CalendarDays} label="Today" className="ml-2" onClick={goToday} />
              <span className="flex-1" />
              <FilterSelect className="h-9! w-[160px]" filter={{ kind: 'select', id: 'department', label: 'Department', value: department,
                defaultValue: ALL, options: optionsFrom('All departments', departments), onChange: setDepartment }} />
              <FilterSelect className="h-9! w-[150px]" filter={{ kind: 'select', id: 'type', label: 'Leave type', value: type,
                defaultValue: ALL, options: optionsFrom('All leave types', LEAVE_TYPES), onChange: setType }} />
              {pendingSwitch}
            </div>

            <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={formatMonth(month)}>
              {WEEKDAYS.map((d, i) => <WeekdayHeader key={d} label={d} weekend={weekendDays.includes(i)} />)}
              {days.map((day) => (
                <DayCell key={toISODate(day)} day={day} month={month} selected={selected} onSelect={setSelected}
                  people={awayOn(entries, toISODate(day))} weekend={isWeekend(day, weekendDays)} />
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                Busier days are shaded darker
                {HEAT_BG.slice(1).map((bg) => <span key={bg} className={cn('size-3.5 rounded-[3px] border', bg)} aria-hidden />)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3.5 rounded-full border-[1.5px] border-dashed border-pending" aria-hidden />dashed ring = pending
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3.5 rounded-[3px] border bg-weekend-bg" aria-hidden />Weekend
              </span>
            </div>
          </Card>
          {panel}
        </div>
      )}
    </>
  )
}

function WeekdayHeader({ label, weekend }: { label: string; weekend: boolean }) {
  return <div role="columnheader" className={cn('pb-1 text-center text-xs font-semibold', weekend ? 'text-weekend' : 'text-muted-foreground')}>{label}</div>
}

interface DayProps {
  day: Date
  month: Date
  selected: string
  onSelect: (iso: string) => void
  people: CalendarEntry[]
  weekend: boolean
}

function dayLabel(day: Date, people: CalendarEntry[], weekend: boolean) {
  return `${format(day, 'MMMM d')}, ${weekend ? 'weekend' : `${people.length} ${people.length === 1 ? 'person' : 'people'} on leave`}`
}

/** Desktop cell: number top-left, up to 3 avatars + "+N" at the bottom. */
function DayCell({ day, month, selected, onSelect, people, weekend }: DayProps) {
  const iso = toISODate(day)
  const isSelected = iso === selected
  const shown = people.slice(0, 3)
  return (
    <button
      type="button"
      onClick={() => onSelect(iso)}
      aria-pressed={isSelected}
      aria-label={dayLabel(day, people, weekend)}
      className={cn(
        'flex h-24 flex-col justify-between rounded-md border p-2 text-left transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        weekend ? 'bg-weekend-bg' : HEAT_BG[heatLevel(people.length)],
        isSelected ? 'border-2 border-highlight p-[7px]' : 'hover:border-highlight/50',
        !isSameMonth(day, month) && 'opacity-40',
      )}
    >
      <span className={cn('text-xl leading-none', isSelected ? 'font-bold' : 'font-semibold', weekend && 'text-weekend')}>{format(day, 'd')}</span>
      {weekend ? (
        <span className="text-[11.5px] font-semibold text-weekend">Weekend</span>
      ) : people.length > 0 && (
        <span className="flex items-center">
          {shown.map(({ employee, request }, i) => (
            // 2px surface ring (padding) so overlapping avatars stay separate;
            // pending people get a dashed amber outline around it.
            <span key={request.id} className={cn('rounded-full bg-surface p-0.5', i > 0 && '-ml-1.5',
              request.status === 'pending' && 'outline-[1.5px] outline-pending outline-dashed')}>
              <Avatar name={fullName(employee)} src={employee.avatarUrl} size={26} />
            </span>
          ))}
          {people.length > 3 && <span className="ml-1 text-xs font-semibold text-muted-foreground">+{people.length - 3}</span>}
        </span>
      )}
    </button>
  )
}

/** Mobile cell: 50px, number plus up to 4 dots (accent approved, amber pending). */
function CompactDay({ day, month, selected, onSelect, people, weekend }: DayProps) {
  const iso = toISODate(day)
  const isSelected = iso === selected
  return (
    <button
      type="button"
      onClick={() => onSelect(iso)}
      aria-pressed={isSelected}
      aria-label={dayLabel(day, people, weekend)}
      className={cn(
        'flex h-[50px] flex-col items-center justify-center gap-1 rounded-md border',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        weekend ? 'bg-weekend-bg text-weekend' : HEAT_BG[heatLevel(people.length)],
        isSelected && 'border-2 border-highlight font-bold',
        !isSameMonth(day, month) && 'opacity-40',
      )}
    >
      <span className="text-[15px] leading-none font-semibold">{format(day, 'd')}</span>
      {!weekend && (
        <span className="flex h-1.5 gap-0.5">
          {people.slice(0, 4).map(({ request }) => (
            <span key={request.id} className={cn('size-1.5 rounded-full', request.status === 'pending' ? 'bg-pending' : 'bg-highlight')} />
          ))}
        </span>
      )}
    </button>
  )
}

