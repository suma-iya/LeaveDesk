import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Mobile only: primary actions pinned to the bottom of the screen. */
export function StickyBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('fixed inset-x-0 bottom-0 z-30 grid gap-2 border-t bg-rail p-3 pb-[max(12px,env(safe-area-inset-bottom))]', className)}>
      {children}
    </div>
  )
}
