import { useState } from 'react'
import { toast } from 'sonner'
import { createEmployee, updateEmployee } from '@/api'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Create (employee = null) or edit (employee = existing row) an employee.
// The form lives inside DialogContent, which unmounts when the dialog
// closes, so its state starts fresh every time the dialog opens.
export function EmployeeFormDialog({ open, onOpenChange, employee, onSaved }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <EmployeeForm employee={employee} onClose={() => onOpenChange(false)} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  )
}

function EmployeeForm({ employee, onClose, onSaved }) {
  const editing = Boolean(employee)
  const [form, setForm] = useState({
    name: employee?.name ?? '',
    email: employee?.email ?? '',
    department: employee?.department ?? '',
    password: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const field = (name) => ({
    id: `employee-${name}`,
    value: form[name],
    onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.value })),
  })

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (editing) await updateEmployee(employee.id, form)
      else await createEmployee(form)
      toast.success(editing ? 'Employee updated' : 'Employee added')
      onClose()
      onSaved?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{editing ? 'Edit employee' : 'Add employee'}</DialogTitle>
        <DialogDescription>
          Without a password the employee signs in with the Google account that matches this email.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="employee-name">Full name</Label>
        <Input required {...field('name')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="employee-email">Email</Label>
        <Input required type="email" {...field('email')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="employee-department">Department</Label>
        <Input placeholder="e.g. Engineering" {...field('department')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="employee-password">
          {editing ? 'New password (leave blank to keep)' : 'Password (optional)'}
        </Label>
        <Input type="password" minLength={8} autoComplete="new-password" {...field('password')} />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add employee'}</Button>
      </DialogFooter>
    </form>
  )
}
