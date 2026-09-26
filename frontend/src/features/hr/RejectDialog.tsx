import { useState } from 'react'
import { X } from 'lucide-react'
import { AppButton } from '@/components/AppButton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatRange } from '@/lib/dates'
import { fullName } from '@/lib/format'
import type { LeaveRequest } from '@/types'

/** Optional note before rejecting from a table row. */
export function RejectDialog({ request, onCancel, onConfirm }: {
  request: LeaveRequest | null; onCancel: () => void; onConfirm: (note: string) => void
}) {
  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent showCloseButton={false} className="rounded-card sm:max-w-md">
        {request && <RejectForm request={request} onCancel={onCancel} onConfirm={onConfirm} />}
      </DialogContent>
    </Dialog>
  )
}

function RejectForm({ request, onCancel, onConfirm }: { request: LeaveRequest; onCancel: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <form onSubmit={(e) => { e.preventDefault(); onConfirm(note) }} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Reject this request?</DialogTitle>
        <DialogDescription>{fullName(request.employee)} · {formatRange(request.startDate, request.endDate)} · {request.code}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reject-note">Note (optional)</Label>
        <Textarea id="reject-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Visible to the employee" autoFocus />
      </div>
      <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <AppButton icon={X} label="Cancel" onClick={onCancel} />
        <AppButton type="submit" icon={X} label="Reject" variant="danger" />
      </DialogFooter>
    </form>
  )
}
