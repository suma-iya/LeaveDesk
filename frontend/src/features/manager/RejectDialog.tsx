import { useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/Button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface RejectDialogProps {
  /** Names of the people being rejected; the dialog is open while non-empty. */
  names: string[]
  onCancel: () => void
  onConfirm: (note: string) => void
}

/** Small dialog for an optional note before rejecting. */
export function RejectDialog({ names, onCancel, onConfirm }: RejectDialogProps) {
  const open = names.length > 0
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent showCloseButton={false} className="rounded-card sm:max-w-md">
        {open && <RejectForm names={names} onCancel={onCancel} onConfirm={onConfirm} />}
      </DialogContent>
    </Dialog>
  )
}

function RejectForm({ names, onCancel, onConfirm }: RejectDialogProps) {
  const [note, setNote] = useState('')
  const many = names.length > 1
  return (
    <form onSubmit={(e) => { e.preventDefault(); onConfirm(note) }} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{many ? `Reject ${names.length} requests?` : 'Reject this request?'}</DialogTitle>
        <DialogDescription>{names.join(', ')}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reject-note">Note for {many ? 'the employees' : 'the employee'} (optional)</Label>
        <Textarea id="reject-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)}
          placeholder="Why can’t this leave be approved?" autoFocus />
      </div>
      <DialogFooter className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <Button icon={X} label="Cancel" variant="secondary" onClick={onCancel} />
        <Button type="submit" icon={X} label={many ? `Reject ${names.length}` : 'Reject'} variant="danger" />
      </DialogFooter>
    </form>
  )
}
