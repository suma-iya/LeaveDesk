import { useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { addMonths, format, isSameMonth, isValid, parseISO, startOfMonth } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '@/api'
import { keys, useDepartments } from '@/api/queries'
import { Avatar } from '@/components/Avatar'
import { AppButton, IconButton } from '@/components/AppButton'
import { FilterSelect } from '@/components/Filters'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { formatMonth, monthKey, toISODate } from '@/lib/dates'
import { ALL, optionsFrom } from '@/lib/filters'
import { fullName } from '@/lib/format'
import { LEAVE_TYPES, TYPE_LABEL, isWeekend } from '@/lib/leave'
import { useIsMobile } from '@/lib/useIsMobile'
import { cn } from '@/lib/utils'
import type { Away, CalendarDay, LeaveType } from '@/types'
import { DayPanel } from './DayPanel'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const HEAT_BG = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3'] as const
const heat = (count: number) => HEAT_BG[Math.min(count, 3)]

const MONTH = /^\d{4}-\d{2}$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The month and the selected day live in the URL (?month=2026-09&day=2026-09-28),
 * so a refresh or the browser's back button keeps them. Without them: the
 * current month, with today selected. Changes replace the history entry, so
 * Back still leaves the calendar.
 */
function useMonthAndDay() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const monthParam = params.get('month') ?? ''
  const dayParam = params.get('day') ?? ''
  const parsedMonth = MONTH.test(monthParam) ? parseISO(`${monthParam}-01`) : null
  const parsedDay = DAY.test(dayParam) ? parseISO(dayParam) : null
  const month = parsedMonth && isValid(parsedMonth) ? parsedMonth : startOfMonth(new Date())
  const selected = parsedDay && isValid(parsedDay) ? dayParam : toISODate(new Date())
  const update = (next: { month?: Date; day?: string }) =>
    setParams((p) => {
      if (next.month) p.set('month', monthKey(next.month))
      if (next.day) p.set('day', next.day)
      return p
    }, { replace: true, state: location.state })
  return {
    month,
    selected,
    setMonth: (change: (m: Date) => Date) => update({ month: change(month) }),
    setSelected: (day: string) => update({ day }),
    goToToday: () => update({ month: startOfMonth(new Date()), day: toISODate(new Date()) }),
  }
}

/** The calendar card (month, filters, legend) and the selected-day panel. */
export function TeamCalendarView() {
  const isMobile = useIsMobile()
  const departments = useDepartments().data ?? []
  const { month, selected, setMonth, setSelected, goToToday } = useMonthAndDay()
  const [department, setDepartment] = useState(ALL)
  const [type, setType] = useState(ALL)
  const [includePending, setIncludePending] = useState(true)

  const filters = {
    department: department === ALL ? undefined : Number(department),
    type: type === ALL ? undefined : (type as LeaveType),
    includePending,
  }
  const calendar = useQuery({
    queryKey: [...keys.calendar, monthKey(month), filters],
    queryFn: () => api.calendar.month(monthKey(month), filters),
    placeholderData: (previous) => previous,
  })
  const days: CalendarDay[] = calendar.data?.days ?? []
  const peopleOn = (iso: string): Away[] => days.find((d) => d.date === iso)?.people ?? []

  const monthNav = (
    <div className={cn('flex items-center gap-1', isMobile && 'w-full')}>
      <IconButton icon={ChevronLeft} label="Previous month" variant="ghost" onClick={() => setMonth((m) => addMonths(m, -1))} />
      <h3 className={cn('min-w-36 text-center text-[17px] font-bold', isMobile && 'flex-1')} aria-live="polite">{formatMonth(month)}</h3>
      <IconButton icon={ChevronRight} label="Next month" variant="ghost" onClick={() => setMonth((m) => addMonths(m, 1))} />
    </div>
  )
  // Desktop: the dashed-ring pending symbol sits in front of the switch label
  // (the switch moved from the toolbar to the end of the legend row).
  const pendingSwitch = (
    <div className="flex items-center gap-2">
      <Switch id="include-pending" checked={includePending} onCheckedChange={setIncludePending} />
      <Label htmlFor="include-pending" className="flex items-center gap-1.5 text-[13px] whitespace-nowrap">
        {!isMobile && <span className="size-3.5 rounded-full border-[1.5px] border-dashed border-pending" aria-hidden />}
        Include pending
      </Label>
    </div>
  )
  // One row per week (5 or 6), sharing the leftover height equally, so days
  // are 96px or taller whenever the window has room (1440×900 and up). On
  // shorter windows they shrink, never below 72px, instead of pushing the
  // legend out of the card or scrolling the page.
  const weeks = Math.max(5, Math.ceil((calendar.isPending ? 35 : days.length) / 7))

  return (
    <div className={cn('flex gap-5', isMobile ? 'flex-col' : 'min-h-0 flex-1')}>
      <section className={cn('flex min-w-0 flex-col rounded-card border bg-surface', isMobile ? 'p-3' : 'flex-1 p-5')}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {monthNav}
          {!isMobile && (
            <>
              <AppButton icon={CalendarDays} label="Today" onClick={goToToday} />
              <span className="flex-1" />
              <FilterSelect className="h-9! w-[150px]" filter={{ kind: 'select', id: 'department', label: 'Department', value: department,
                defaultValue: ALL, options: optionsFrom('All departments', departments.map((d) => ({ value: String(d.id), label: d.name }))), onChange: setDepartment }} />
              <FilterSelect className="h-9! w-[140px]" filter={{ kind: 'select', id: 'type', label: 'Leave type', value: type,
                defaultValue: ALL, options: optionsFrom('All leave types', LEAVE_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))), onChange: setType }} />
            </>
          )}
        </div>

        {/* Six-week months tighten the row gap to 4px so the legend stays inside the card on short windows. */}
        <div className={cn('grid grid-cols-7', isMobile ? 'gap-1' : cn('flex-1 gap-x-1.5', weeks > 5 ? 'gap-y-1' : 'gap-y-1.5'))} role="grid" aria-label={formatMonth(month)}
          style={isMobile ? undefined : { gridTemplateRows: `auto repeat(${weeks}, minmax(72px, 1fr))` }}>
          {WEEKDAYS.map((d, i) => (
            <div key={d} role="columnheader" className={cn('pb-1 text-center text-xs font-semibold', i >= 5 ? 'text-weekend' : 'text-muted-foreground')}>{d}</div>
          ))}
          {calendar.isPending
            ? Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className={isMobile ? 'h-[50px]' : 'h-full'} />)
            : days.map(({ date }) => (
              <DayButton key={date} date={date} month={month} selected={selected === date} people={peopleOn(date)}
                onSelect={setSelected} compact={isMobile} />
            ))}
        </div>

        {!isMobile && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              Busier days are shaded darker
              {HEAT_BG.slice(1).map((bg) => <span key={bg} className={cn('size-3.5 rounded-[3px] border', bg)} aria-hidden />)}
            </span>
            <span className="flex items-center gap-1.5"><span className="size-3.5 rounded-[3px] border bg-weekend-bg" aria-hidden />Weekend</span>
            <div className="ml-auto text-foreground">{pendingSwitch}</div>
          </div>
        )}
      </section>

      <DayPanel day={selected} people={isWeekend(selected) ? [] : peopleOn(selected)}
        titleAside={isMobile ? pendingSwitch : undefined} className={isMobile ? '' : 'max-h-full w-[360px] shrink-0 self-start'} />
    </div>
  )
}

function dayLabel(date: string, people: Away[]) {
  return `${format(parseISO(date), 'MMMM d')}, ${isWeekend(date) ? 'weekend' : `${people.length} ${people.length === 1 ? 'person' : 'people'} on leave`}`
}


/** Desktop cell at least 96px tall (number, up to 3 avatars, or 2 and "+N") or 50px mobile cell (dots). */
function DayButton({ date, month, selected, people, onSelect, compact }: {
  date: string; month: Date; selected: boolean; people: Away[]; onSelect: (iso: string) => void; compact: boolean
}) {
  const weekend = isWeekend(date)
  const otherMonth = !isSameMonth(parseISO(date), month)
  // Up to 3 avatars; with more people, 2 and "+N". A cell too narrow for that
  // (three avatars need about 76px inside, two and "+N" about 72px; e.g.
  // 1280px wide with the sidebar open) shows up to 2, or 1 and "+N". The
  // cell's own width decides, so no cell ever overflows.
  const roomy = people.length > 3 ? 'flex @max-[72px]:hidden' : 'flex @max-[76px]:hidden'
  const narrow = people.length > 3 ? 'hidden @max-[72px]:flex' : 'hidden @max-[76px]:flex'
  const avatars = (limit: number, className: string) => {
    const shown = people.length > limit ? limit - 1 : limit
    return (
      <span className={cn('items-center', className)}>
        {people.slice(0, shown).map((p, i) => (
          // 2px surface ring keeps overlapping avatars apart; pending gets a dashed amber ring.
          <span key={p.requestId} className={cn('rounded-full bg-surface p-0.5', i > 0 && '-ml-1.5',
            p.status === 'pending' && 'outline-[1.5px] outline-pending outline-dashed')}>
            <Avatar name={fullName(p)} src={p.avatarUrl} size={26} />
          </span>
        ))}
        {people.length > shown && <span className="ml-1 text-xs font-semibold text-muted-foreground">+{people.length - shown}</span>}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      aria-pressed={selected}
      aria-label={dayLabel(date, people)}
      className={cn(
        'flex rounded-md border transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        compact ? 'h-[50px] flex-col items-center justify-center gap-1' : '@container h-full flex-col justify-between p-2 text-left',
        weekend ? 'bg-weekend-bg' : heat(people.length),
        selected ? cn('border-2 border-highlight', !compact && 'p-[7px]') : 'hover:border-highlight/50',
        otherMonth && 'opacity-40',
      )}
    >
      <span className={cn('leading-none', compact ? 'text-[15px]' : 'text-xl', selected ? 'font-bold' : 'font-semibold', weekend && 'text-weekend')}>
        {format(parseISO(date), 'd')}
      </span>
      {compact ? (
        !weekend && (
          <span className="flex h-1.5 gap-0.5">
            {people.slice(0, 4).map((p) => <span key={p.requestId} className={cn('size-1.5 rounded-full', p.status === 'pending' ? 'bg-pending' : 'bg-highlight')} />)}
          </span>
        )
      ) : weekend ? (
        <span className="text-[11.5px] font-semibold text-weekend">Weekend</span>
      ) : people.length > 0 && (
        <>
          {avatars(3, roomy)}
          {avatars(2, narrow)}
        </>
      )}
    </button>
  )
}
