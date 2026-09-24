import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** 12px radius, border, surface. No shadow (shadows are for menus only). */
export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-card border bg-surface', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('text-base font-bold', className)} {...props} />
}

/** Inset tile for a single number (10px radius on --sunk). */
export function StatTile({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-tile bg-sunk px-3 py-2.5', className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{value}</div>
    </div>
  )
}
