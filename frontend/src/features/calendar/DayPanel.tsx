import { parseISO } from 'date-fns'
import { Avatar } from '@/components/Avatar'
import { StatusBadge } from '@/components/StatusBadge'
import { formatLongDate, formatRange } from '@/lib/dates'
import { fullName } from '@/lib/format'
import { TYPE_LABEL, isWeekend } from '@/lib/leave'
import { cn } from '@/lib/utils'
import type { Away } from '@/types'
import type { ReactNode } from 'react'

/** Right panel: who is away on the selected day. Never shows balances. */
export function DayPanel({ day, people, titleAside, className }: { day: string; people: Away[]; titleAside?: ReactNode; className?: string }) {
  const weekend = isWeekend(day)
  const byTeam = Object.entries(people.reduce<Record<string, number>>((acc, p) => {
    const team = p.department?.name ?? 'No department'
    acc[team] = (acc[team] ?? 0) + 1
    return acc
  }, {})).sort((a, b) => b[1] - a[1])

  return (
    <section className={cn('flex flex-col rounded-card border bg-surface', className)} aria-live="polite">
      <div className="flex items-start gap-3 border-b p-5">
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-bold tracking-[0.08em] text-highlight">SELECTED DAY</p>
          <h3 className="mt-1 text-[17px] font-bold">{formatLongDate(parseISO(day))}</h3>
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
          <ul className="min-h-0 flex-1 divide-y overflow-y-auto">
            {people.map((p) => (
              <li key={p.requestId} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={fullName(p)} src={p.avatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{fullName(p)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.department?.name ?? 'No department'} · {TYPE_LABEL[p.type]} · {formatRange(p.startDate, p.endDate)}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">By team: {byTeam.map(([team, n]) => `${team} ${n}`).join(' · ')}</p>
        </>
      ))}
    </section>
  )
}
