import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Mobile only: the page's main actions pinned just above the 72px tab bar.
 * A spacer of the same height keeps the last content visible above it.
 */
export function StickyBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <>
      <div aria-hidden className="h-[72px] shrink-0" />
      <div className={cn('fixed inset-x-0 bottom-[72px] z-20 grid gap-2 border-t bg-rail p-3', className)}>
        {children}
      </div>
    </>
  )
}
