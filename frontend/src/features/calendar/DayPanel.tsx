import { parseISO } from 'date-fns'
import { Avatar } from '@/components/Avatar'
import { Card } from '@/components/Card'
import { StatusBadge } from '@/components/StatusBadge'
import { formatLongDate, formatRange } from '@/lib/dates'
import { fullName } from '@/lib/format'
import { isWeekend } from '@/lib/leave'
import type { CalendarEntry } from '@/types'
import type { ReactNode } from 'react'

interface DayPanelProps {
  day: string
  people: CalendarEntry[]
  weekendDays: number[]
  /** HR sees each person's remaining days; employees never do. */
  showBalances: boolean
  titleAside?: ReactNode
  className?: string
}

export function DayPanel({ day, people, weekendDays, showBalances, titleAside, className }: DayPanelProps) {
  const weekend = isWeekend(day, weekendDays)
  const byTeam = Object.entries(people.reduce<Record<string, number>>((acc, p) => {
    acc[p.employee.department] = (acc[p.employee.department] ?? 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1])

  return (
    <Card className={className}>
      <div className="flex items-start gap-3 border-b p-5">
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-[11.5px] font-bold tracking-[0.08em] text-highlight">SELECTED DAY</p>
          <h2 className="mt-1 text-[17px] font-bold">{formatLongDate(parseISO(day))}</h2>
          <p className="text-[13px] text-muted-foreground">
            {weekend ? 'Weekend (Friday and Saturday)' : `${people.length} ${people.length === 1 ? 'person' : 'people'} on leave`}
          </p>
        </div>
        {titleAside}
      </div>

      {!weekend && (people.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">Nobody is on leave this day.</p>
      ) : (
        <>
          <ul className="divide-y">
            {people.map(({ request: r, employee, daysLeft }) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={fullName(employee)} src={employee.avatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{fullName(employee)}</p>
                  <p className="truncate text-xs text-muted-foreground">{employee.department} · {r.type} · {formatRange(r.startDate, r.endDate)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={r.status} />
                  {showBalances && daysLeft !== undefined && <span className="text-[11.5px] text-muted-foreground">{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</span>}
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            By team: {byTeam.map(([team, n]) => `${team} ${n}`).join(' · ')}
          </p>
        </>
      ))}
    </Card>
  )
}
