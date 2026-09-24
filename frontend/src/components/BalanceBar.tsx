import { cn } from '@/lib/utils'

interface BalanceBarProps {
  used: number
  allowance: number
  className?: string
}

const LOW_BALANCE = 4

/** "8/22 used · 14 left" with a 6px bar. Turns amber when 4 or fewer days are left. */
export function BalanceBar({ used, allowance, className }: BalanceBarProps) {
  const left = Math.max(0, allowance - used)
  const low = left <= LOW_BALANCE
  const percent = allowance > 0 ? Math.min(100, (used / allowance) * 100) : 0

  return (
    <div className={cn('w-[120px]', className)}>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <span className="font-semibold">{used}/{allowance} used</span>
        <span className={low ? 'font-semibold text-pending' : 'text-muted-foreground'}>{left} left</span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-sunk"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={allowance}
        aria-valuenow={used}
        aria-label={`${used} of ${allowance} days used, ${left} left`}
      >
        <div className={cn('h-full rounded-full', low ? 'bg-pending' : 'bg-highlight')} style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
