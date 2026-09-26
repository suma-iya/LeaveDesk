import { cn } from '@/lib/utils'

const LOW = 4

/**
 * "8/22 used · 14 left" over a 6px bar (110px wide in tables, 200px on the
 * review page). Left counts pending days too; amber at 4 or fewer.
 */
export function BalanceBar({ used, pending = 0, limit, width = 110, className }: {
  used: number; pending?: number; limit: number; width?: number | 'full'; className?: string
}) {
  const left = Math.max(0, limit - used - pending)
  const low = left <= LOW
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  return (
    <div className={cn(width === 'full' && 'w-full', className)} style={width === 'full' ? undefined : { width }}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold">{used}/{limit} used</span>
        <span className={low ? 'font-semibold text-pending' : 'text-muted-foreground'}>{left} left</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sunk" role="meter" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}
        aria-label={`${used} of ${limit} days used, ${left} left`}>
        <div className={cn('h-full rounded-full', low ? 'bg-pending' : 'bg-highlight')} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
