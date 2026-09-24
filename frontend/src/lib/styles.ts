import type { LeaveType, Status } from '@/types'

// Full class names are listed (not built from strings) so Tailwind can find them.
// Leave-type colours and status colours are separate systems.

export const typeStyles: Record<LeaveType, { bg: string; text: string; borderTop: string; borderLeft: string }> = {
  Annual: { bg: 'bg-type-annual', text: 'text-type-annual', borderTop: 'border-t-type-annual', borderLeft: 'border-l-type-annual' },
  Casual: { bg: 'bg-type-casual', text: 'text-type-casual', borderTop: 'border-t-type-casual', borderLeft: 'border-l-type-casual' },
  Sick: { bg: 'bg-type-sick', text: 'text-type-sick', borderTop: 'border-t-type-sick', borderLeft: 'border-l-type-sick' },
}

export const statusStyles: Record<Status, { pill: string; tint: string }> = {
  pending: { pill: 'bg-pending-bg text-pending', tint: 'bg-pending-bg' },
  approved: { pill: 'bg-ok-bg text-ok', tint: 'bg-ok-bg' },
  rejected: { pill: 'bg-danger-bg text-danger', tint: 'bg-danger-bg' },
}
