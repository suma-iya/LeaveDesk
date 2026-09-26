import { Card } from '@/components/Card'
import { LeaveTypeTag, TypeSwatch } from '@/components/LeaveTypeTag'
import { StackedBar } from '@/components/StackedBar'
import { Skeleton } from '@/components/ui/skeleton'
import { TYPE_LABEL, available, sumBalances } from '@/lib/leave'
import { typeStyles } from '@/lib/styles'
import { cn } from '@/lib/utils'
import type { Balance } from '@/types'

/** Used days per type in their colours, then pending as amber stripes. */
export function yearlySegments(balances: Balance[]) {
  return [
    ...balances.map((b) => ({ type: b.type, days: b.used })),
    { type: 'pending' as const, days: balances.reduce((n, b) => n + b.pending, 0) },
  ]
}

export function BalanceLegend({ balances }: { balances: Balance[] }) {
  const pending = balances.reduce((n, b) => n + b.pending, 0)
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {balances.map((b) => <li key={b.type} className="flex items-center gap-1.5"><TypeSwatch type={b.type} />{TYPE_LABEL[b.type]} {b.used}</li>)}
      <li className="flex items-center gap-1.5"><span className="pending-stripes inline-block size-2 rounded-[2px]" aria-hidden />Pending {pending}</li>
    </ul>
  )
}

/** Desktop: Yearly vacation card (flex 1.5) + Annual / Casual / Sick (flex 1 each). */
export function BalanceRow({ balances, year }: { balances: Balance[] | undefined; year: number }) {
  if (!balances) {
    return <div className="flex gap-4">{[1.5, 1, 1, 1].map((f, i) => <Skeleton key={i} className="h-40 rounded-card" style={{ flex: f }} />)}</div>
  }
  const totals = sumBalances(balances)
  return (
    <div className="flex gap-4">
      <Card className="flex flex-[1.5] flex-col gap-3 border-t-[3px] border-t-foreground p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">Yearly vacation {year}</h2>
          <span className="text-xs text-muted-foreground">{totals.limit} days, all types</span>
        </div>
        <p className="flex items-baseline gap-2">
          <span className="text-[28px] leading-none font-bold">{available(totals)}</span>
          <span className="text-[13px] text-muted-foreground">available · {totals.used} used · {totals.pending} pending</span>
        </p>
        <StackedBar segments={yearlySegments(balances)} total={totals.limit} />
        <BalanceLegend balances={balances} />
      </Card>
      {balances.map((b) => (
        <Card key={b.type} className={cn('flex flex-1 flex-col gap-3 border-t-[3px] p-5', typeStyles[b.type].borderTop)}>
          <div className="flex items-baseline justify-between gap-2">
            <LeaveTypeTag type={b.type} className="font-semibold" />
            <span className="text-xs text-muted-foreground">{b.limit} days / year</span>
          </div>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[28px] leading-none font-bold">{available(b)}</span>
            <span className="text-[13px] text-muted-foreground">available</span>
          </p>
          <p className="text-[13px] text-muted-foreground">{b.used} used · {b.pending} pending</p>
          <StackedBar segments={[{ type: b.type, days: b.used }, { type: 'pending', days: b.pending }]} total={b.limit} className="mt-auto" />
        </Card>
      ))}
    </div>
  )
}

/** Mobile: a hero with the big number, then three small type tiles. */
export function MobileBalances({ balances }: { balances: Balance[] | undefined }) {
  if (!balances) return <Skeleton className="h-52 rounded-card" />
  const totals = sumBalances(balances)
  return (
    <>
      <Card className="flex flex-col gap-3 p-5">
        <p className="flex items-baseline gap-2">
          <span className="text-[40px] leading-none font-bold">{available(totals)}</span>
          <span className="text-sm text-muted-foreground">of {totals.limit} days available</span>
        </p>
        <StackedBar segments={yearlySegments(balances)} total={totals.limit} />
        <p className="text-[13px] text-muted-foreground">{totals.used} used · {totals.pending} waiting for approval</p>
      </Card>
      <div className="grid grid-cols-3 gap-2">
        {balances.map((b) => (
          <Card key={b.type} className={cn('border-t-[3px] p-3', typeStyles[b.type].borderTop)}>
            <p className="text-xs font-semibold">{TYPE_LABEL[b.type]}</p>
            <p className="mt-1 text-lg font-bold">{available(b)}<span className="text-xs font-normal text-muted-foreground"> / {b.limit}</span></p>
            <p className="text-[11.5px] text-muted-foreground">available</p>
          </Card>
        ))}
      </div>
    </>
  )
}
