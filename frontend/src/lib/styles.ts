import type { LeaveType, Status } from '@/types'

// Full class names (not built from strings) so Tailwind can find them.
// Leave-type colours and status colours are separate systems.

export const typeStyles: Record<LeaveType, { bg: string; borderTop: string; borderLeft: string }> = {
  annual: { bg: 'bg-type-annual', borderTop: 'border-t-type-annual', borderLeft: 'border-l-type-annual' },
  casual: { bg: 'bg-type-casual', borderTop: 'border-t-type-casual', borderLeft: 'border-l-type-casual' },
  sick: { bg: 'bg-type-sick', borderTop: 'border-t-type-sick', borderLeft: 'border-l-type-sick' },
}

export const statusStyles: Record<Status, { pill: string; tint: string }> = {
  pending: { pill: 'bg-pending-bg text-pending', tint: 'bg-pending-bg' },
  approved: { pill: 'bg-ok-bg text-ok', tint: 'bg-ok-bg' },
  rejected: { pill: 'bg-danger-bg text-danger', tint: 'bg-danger-bg' },
  cancelled: { pill: 'bg-sunk text-muted-foreground', tint: 'bg-sunk' },
}

/** Inputs and selects: 36px on desktop, 44px on mobile. Auth pages use `authInput`. */
export const inputHeight = 'h-9 max-md:h-11'
export const authInput = 'h-11'
