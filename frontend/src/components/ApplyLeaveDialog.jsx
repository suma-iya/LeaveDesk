import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { applyForLeave } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { LEAVE_TYPES, todayISO } from '@/lib/format'

const EMPTY_FORM = { leave_type: 'ANNUAL', start_date: '', end_date: '', reason: '' }

export function ApplyLeaveDialog({ onApplied }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const update = (field) => (value) => setForm((f) => ({ ...f, [field]: value }))

  // Quick checks for instant feedback. The server repeats every rule,
  // because a client-side check alone can always be bypassed.
  function validate() {
    if (!form.start_date || !form.end_date) return 'Pick a start and end date.'
    if (form.end_date < form.start_date) return 'End date cannot be before start date.'
    if (!form.reason.trim()) return 'Please give a reason.'
    return ''
  }

  async function submit(event) {
    event.preventDefault()
    const problem = validate()
    if (problem) return setError(problem)

    setSaving(true)
    setError('')
    try {
      await applyForLeave(form)
      toast.success('Leave request submitted')
      setForm(EMPTY_FORM)
      setOpen(false)
      onApplied?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Sick leave can be recorded after the fact; other types must be in the future.
  const minDate = form.leave_type === 'SICK' ? undefined : todayISO()

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { setOpen(isOpen); setError('') }}>
      <DialogTrigger asChild>
        <Button><Plus /> Apply for leave</Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Apply for leave</DialogTitle>
            <DialogDescription>Your manager will be able to approve or reject it.</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="leave-type">Leave type</Label>
            <Select value={form.leave_type} onValueChange={update('leave_type')}>
              <SelectTrigger id="leave-type" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start-date">From</Label>
              <Input id="start-date" type="date" min={minDate} value={form.start_date}
                onChange={(e) => update('start_date')(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">To</Label>
              <Input id="end-date" type="date" min={form.start_date || minDate} value={form.end_date}
                onChange={(e) => update('end_date')(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea id="reason" maxLength={500} value={form.reason}
              onChange={(e) => update('reason')(e.target.value)} placeholder="e.g. Family event" />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit request'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
