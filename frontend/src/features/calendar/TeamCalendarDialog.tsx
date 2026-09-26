import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addMonths, format, isSameMonth, parseISO, startOfMonth } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { api } from '@/api'
import { keys, useDepartments } from '@/api/queries'
import { Avatar } from '@/components/Avatar'
import { AppButton, IconButton } from '@/components/AppButton'
import { FilterSelect } from '@/components/Filters'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useCalendarOverlay } from '@/layouts/calendarOverlay'
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

/** The Team calendar overlay. Esc, the X or the header button closes it. */
export function TeamCalendarDialog() {
  const { open, setOpen } = useCalendarOverlay()
  const isMobile = useIsMobile()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          'flex max-w-none translate-x-0 translate-y-0 flex-col gap-4 overflow-y-auto bg-background text-foreground sm:max-w-none',
          isMobile ? 'inset-0 top-0 left-0 h-svh w-full rounded-none p-4' : 'inset-5 top-5 left-5 w-auto rounded-dialog px-6 py-[22px]',
        )}
      >
        {open && <CalendarBody onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function CalendarBody({ onClose }: { onClose: () => void }) {
  const isMobile = useIsMobile()
  const departments = useDepartments().data ?? []
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [selected, setSelected] = useState(() => toISODate(new Date()))
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
  const pendingSwitch = (
    <div className="flex items-center gap-2">
      <Switch id="include-pending" checked={includePending} onCheckedChange={setIncludePending} />
      <Label htmlFor="include-pending" className="text-[13px] whitespace-nowrap">Include pending</Label>
    </div>
  )

  return (
    <>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <DialogTitle className="text-[22px] font-bold tracking-[-0.02em]">Team calendar</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            Click a day to see who is away. Fri and Sat are weekend. Press Esc to close.
          </DialogDescription>
        </div>
        <IconButton icon={X} label="Close calendar" variant="secondary" onClick={onClose} />
      </div>

      <div className={cn('flex min-h-0 gap-5', isMobile && 'flex-col')}>
        <section className={cn('rounded-card border bg-surface', isMobile ? 'p-3' : 'w-[940px] shrink-0 p-5')}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {monthNav}
            {!isMobile && (
              <>
                <AppButton icon={CalendarDays} label="Today" onClick={() => { setMonth(startOfMonth(new Date())); setSelected(toISODate(new Date())) }} />
                <span className="flex-1" />
                <FilterSelect className="h-9! w-[160px]" filter={{ kind: 'select', id: 'department', label: 'Department', value: department,
                  defaultValue: ALL, options: optionsFrom('All departments', departments.map((d) => ({ value: String(d.id), label: d.name }))), onChange: setDepartment }} />
                <FilterSelect className="h-9! w-[150px]" filter={{ kind: 'select', id: 'type', label: 'Leave type', value: type,
                  defaultValue: ALL, options: optionsFrom('All leave types', LEAVE_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))), onChange: setType }} />
                {pendingSwitch}
              </>
            )}
          </div>

          <div className={cn('grid grid-cols-7', isMobile ? 'gap-1' : 'gap-1.5')} role="grid" aria-label={formatMonth(month)}>
            {WEEKDAYS.map((d, i) => (
              <div key={d} role="columnheader" className={cn('pb-1 text-center text-xs font-semibold', i >= 5 ? 'text-weekend' : 'text-muted-foreground')}>{d}</div>
            ))}
            {calendar.isPending
              ? Array.from({ length: 35 }, (_, i) => <Skeleton key={i} className={isMobile ? 'h-[50px]' : 'h-24'} />)
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
              <span className="flex items-center gap-1.5"><span className="size-3.5 rounded-full border-[1.5px] border-dashed border-pending" aria-hidden />dashed ring = pending</span>
              <span className="flex items-center gap-1.5"><span className="size-3.5 rounded-[3px] border bg-weekend-bg" aria-hidden />Weekend</span>
            </div>
          )}
        </section>

        <DayPanel day={selected} people={isWeekend(selected) ? [] : peopleOn(selected)}
          titleAside={isMobile ? pendingSwitch : undefined} className={isMobile ? '' : 'min-w-0 flex-1 self-start'} />
      </div>
    </>
  )
}

function dayLabel(date: string, people: Away[]) {
  return `${format(parseISO(date), 'MMMM d')}, ${isWeekend(date) ? 'weekend' : `${people.length} ${people.length === 1 ? 'person' : 'people'} on leave`}`
}

/** 96px desktop cell (number, up to 3 avatars + "+N") or 50px mobile cell (dots). */
function DayButton({ date, month, selected, people, onSelect, compact }: {
  date: string; month: Date; selected: boolean; people: Away[]; onSelect: (iso: string) => void; compact: boolean
}) {
  const weekend = isWeekend(date)
  const otherMonth = !isSameMonth(parseISO(date), month)
  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      aria-pressed={selected}
      aria-label={dayLabel(date, people)}
      className={cn(
        'flex rounded-md border transition-colors',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        compact ? 'h-[50px] flex-col items-center justify-center gap-1' : 'h-24 flex-col justify-between p-2 text-left',
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
        <span className="flex items-center">
          {people.slice(0, 3).map((p, i) => (
            // 2px surface ring keeps overlapping avatars apart; pending gets a dashed amber ring.
            <span key={p.requestId} className={cn('rounded-full bg-surface p-0.5', i > 0 && '-ml-1.5',
              p.status === 'pending' && 'outline-[1.5px] outline-pending outline-dashed')}>
              <Avatar name={fullName(p)} src={p.avatarUrl} size={26} />
            </span>
          ))}
          {people.length > 3 && <span className="ml-1 text-xs font-semibold text-muted-foreground">+{people.length - 3}</span>}
        </span>
      )}
    </button>
  )
}
