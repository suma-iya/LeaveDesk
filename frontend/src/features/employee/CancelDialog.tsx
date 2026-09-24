import { Undo2, X } from 'lucide-react'
import { Button } from '@/components/Button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { formatRange } from '@/lib/dates'
import type { LeaveRequest } from '@/types'

/** "Are you sure?" before withdrawing a pending request (it cannot be undone). */
export function CancelDialog({ request, onClose, onConfirm, busy }: {
  request: LeaveRequest | null; onClose: () => void; onConfirm: () => void; busy: boolean
}) {
  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="rounded-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this request?</DialogTitle>
          <DialogDescription>
            {request && `${request.type} leave, ${formatRange(request.startDate, request.endDate)}. HR will no longer see it.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <Button icon={X} label="Cancel request" variant="danger" loading={busy} onClick={onConfirm} />
          <Button icon={Undo2} label="Keep it" variant="secondary" onClick={onClose} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
