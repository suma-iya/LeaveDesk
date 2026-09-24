import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { deleteEmployee, getEmployees } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { PageHeader } from '@/components/AppLayout'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { EmployeeFormDialog } from '@/components/EmployeeFormDialog'
import { EmptyState, ErrorState, LoadingState } from '@/components/PageState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function EmployeesPage() {
  const employees = useAsync(getEmployees, [])
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)

  const openForm = (employee = null) => { setEditing(employee); setFormOpen(true) }

  async function handleDelete(employee) {
    try {
      await deleteEmployee(employee.id)
      toast.success(`${employee.name} removed`)
      employees.reload()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <>
      <PageHeader title="Employees" description="Everyone you manage, with their leave history at a glance.">
        <Button onClick={() => openForm()}><UserPlus /> Add employee</Button>
      </PageHeader>

      <Card>
        <CardContent>
          {employees.loading && !employees.data ? <LoadingState rows={4} />
            : employees.error ? <ErrorState error={employees.error} onRetry={employees.reload} />
            : employees.data.length === 0 ? <EmptyState title="No employees yet" description="Add one, or ask them to sign in with Google." />
            : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead className="text-right">Approved</TableHead>
                    <TableHead className="text-right">Rejected</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.data.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <Link to={`/employees/${employee.id}`} className="font-medium hover:underline">{employee.name}</Link>
                        <div className="text-xs text-muted-foreground">{employee.email}</div>
                      </TableCell>
                      <TableCell>{employee.department || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right">
                        {employee.leaves.pending > 0
                          ? <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-300">{employee.leaves.pending}</Badge>
                          : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{employee.leaves.approved}</TableCell>
                      <TableCell className="text-right tabular-nums">{employee.leaves.rejected}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="outline" asChild>
                            <Link to={`/employees/${employee.id}`}>View leaves</Link>
                          </Button>
                          <Button size="icon-sm" variant="ghost" aria-label={`Edit ${employee.name}`} onClick={() => openForm(employee)}>
                            <Pencil />
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Delete ${employee.name}`}>
                                <Trash2 />
                              </Button>
                            }
                            title={`Delete ${employee.name}?`}
                            description="This also deletes all of their leave requests. It cannot be undone."
                            confirmLabel="Delete"
                            onConfirm={() => handleDelete(employee)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <EmployeeFormDialog open={formOpen} onOpenChange={setFormOpen} employee={editing} onSaved={employees.reload} />
    </>
  )
}
