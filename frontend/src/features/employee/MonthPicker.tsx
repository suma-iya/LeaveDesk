import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/Button'
import { formatMonth, toISODate } from '@/lib/dates'
import { isWeekend } from '@/lib/leave'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface MonthPickerProps {
  month: Date
  onMonthChange: (month: Date) => void
  start: string | null
  end: string | null
  onPick: (day: string) => void
  /** Hint changes after the first click. */
  pickingEnd: boolean
  /** The employee's own pending leave (dashed amber border). No teammate data here. */
  pendingDays: Set<string>
  weekendDays: number[]
  compact?: boolean
}

export function MonthPicker(props: MonthPickerProps) {
  const { month, start, end, weekendDays, compact } = props
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <IconButton icon={ChevronLeft} label="Previous month" variant="secondary" onClick={() => props.onMonthChange(addMonths(month, -1))} />
        <h2 className="flex-1 text-center text-[17px] font-bold" aria-live="polite">{formatMonth(month)}</h2>
        <IconButton icon={ChevronRight} label="Next month" variant="secondary" onClick={() => props.onMonthChange(addMonths(month, 1))} />
      </div>
      <p className="text-center text-[13px] text-muted-foreground">
        {props.pickingEnd ? 'Now click your last day off' : 'Click your first day off, then your last day off'}
      </p>

      <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={formatMonth(month)}>
        {WEEKDAYS.map((d, i) => (
          <div key={d} role="columnheader" className={cn('pb-1 text-center text-xs font-semibold',
            weekendDays.includes(i) ? 'text-weekend' : 'text-muted-foreground')}>{d}</div>
        ))}
        {days.map((day) => {
          const iso = toISODate(day)
          const endpoint = iso === start || iso === end
          const between = start && end && iso > start && iso < end
          const weekend = isWeekend(day, weekendDays)
          const pending = props.pendingDays.has(iso)
          return (
            <button
              key={iso}
              type="button"
              onClick={() => props.onPick(iso)}
              aria-pressed={Boolean(endpoint || between)}
              aria-label={`${format(day, 'EEEE d MMMM yyyy')}${weekend ? ', weekend' : ''}${pending ? ', your pending leave' : ''}`}
              className={cn(
                'flex items-center justify-center rounded-md border border-transparent font-semibold transition-colors',
                compact ? 'h-11 text-base' : 'h-16 text-lg',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
                weekend ? 'bg-weekend-bg text-weekend' : 'bg-surface hover:bg-soft-hover',
                between && 'bg-highlight-soft text-foreground hover:bg-highlight-soft',
                endpoint && 'bg-highlight text-on-primary hover:bg-highlight',
                pending && !endpoint && 'border-[1.5px] border-dashed border-pending',
                !isSameMonth(day, month) && 'opacity-40',
              )}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-highlight" aria-hidden />Your new leave</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] border-[1.5px] border-dashed border-pending" aria-hidden />Your pending leave</li>
        <li className="flex items-center gap-1.5"><span className="size-3 rounded-[3px] bg-weekend-bg ring-1 ring-weekend/30" aria-hidden />Weekend (not counted)</li>
      </ul>
    </div>
  )
}
