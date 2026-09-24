import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { reviewLeave } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatRange, leaveTypeLabel } from '@/lib/format'

// Approve / Reject buttons for one PENDING leave, with a confirm dialog
// where the manager can leave a comment. Renders nothing for non-managers.
export function ReviewActions({ leave, onReviewed }) {
  const { isManager } = useAuth()
  const [decision, setDecision] = useState(null) // 'APPROVED' | 'REJECTED' | null
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  if (!isManager || leave.status !== 'PENDING') return null

  const open = (status) => { setComment(''); setDecision(status) }

  async function submit() {
    setSaving(true)
    try {
      await reviewLeave(leave.id, decision, comment)
      toast.success(`Leave ${decision === 'APPROVED' ? 'approved' : 'rejected'} for ${leave.employee_name}`)
      setDecision(null)
      onReviewed?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const approving = decision === 'APPROVED'

  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="outline" onClick={() => open('APPROVED')}>
        <Check /> Approve
      </Button>
      <Button size="sm" variant="outline" className="text-destructive" onClick={() => open('REJECTED')}>
        <X /> Reject
      </Button>

      <Dialog open={decision !== null} onOpenChange={(isOpen) => !isOpen && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{approving ? 'Approve' : 'Reject'} leave request?</DialogTitle>
            <DialogDescription>
              {leave.employee_name} · {leaveTypeLabel(leave.leave_type)} · {formatRange(leave.start_date, leave.end_date)} ({leave.days} day{leave.days > 1 ? 's' : ''})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="rounded-md bg-muted p-3 text-sm">{leave.reason}</p>
            <Label htmlFor={`comment-${leave.id}`}>Comment (optional)</Label>
            <Textarea
              id={`comment-${leave.id}`}
              value={comment}
              maxLength={500}
              onChange={(e) => setComment(e.target.value)}
              placeholder={approving ? 'Enjoy your time off!' : 'Reason for rejecting'}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>Cancel</Button>
            <Button variant={approving ? 'default' : 'destructive'} onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : approving ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
