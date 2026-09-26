import { Undo2, X } from 'lucide-react'
import { AppButton } from '@/components/AppButton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatRange } from '@/lib/dates'
import { TYPE_LABEL } from '@/lib/leave'
import type { LeaveRequest } from '@/types'

/** "Are you sure?" before withdrawing a pending request. Cancel sits left. */
export function CancelDialog({ request, onClose, onConfirm, busy }: {
  request: LeaveRequest | null; onClose: () => void; onConfirm: () => void; busy: boolean
}) {
  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="rounded-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this request?</DialogTitle>
          <DialogDescription>
            {request && `${TYPE_LABEL[request.type]} leave, ${formatRange(request.startDate, request.endDate)}. HR will no longer see it.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <AppButton icon={X} label="Cancel request" variant="danger" loading={busy} onClick={onConfirm} />
          <AppButton icon={Undo2} label="Keep it" onClick={onClose} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
