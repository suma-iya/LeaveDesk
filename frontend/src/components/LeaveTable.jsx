import { Link } from 'react-router-dom'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { StatusBadge } from '@/components/StatusBadge'
import { formatDateTime, formatRange, leaveTypeLabel } from '@/lib/format'

// One table for every leave list in the app. Pages decide which columns
// matter (showEmployee) and which buttons appear (renderActions).
export function LeaveTable({ leaves, showEmployee = false, linkEmployee = false, renderActions }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showEmployee && <TableHead>Employee</TableHead>}
          <TableHead>Type</TableHead>
          <TableHead>Dates</TableHead>
          <TableHead className="text-right">Days</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Submitted</TableHead>
          {renderActions && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {leaves.map((leave) => (
          <TableRow key={leave.id}>
            {showEmployee && (
              <TableCell>
                {linkEmployee ? (
                  <Link to={`/employees/${leave.user_id}`} className="font-medium hover:underline">
                    {leave.employee_name}
                  </Link>
                ) : (
                  <span className="font-medium">{leave.employee_name}</span>
                )}
                <div className="text-xs text-muted-foreground">{leave.employee_email}</div>
              </TableCell>
            )}
            <TableCell>{leaveTypeLabel(leave.leave_type)}</TableCell>
            <TableCell className="whitespace-nowrap">{formatRange(leave.start_date, leave.end_date)}</TableCell>
            <TableCell className="text-right tabular-nums">{leave.days}</TableCell>
            <TableCell className="max-w-64">
              <p className="truncate" title={leave.reason}>{leave.reason}</p>
              {leave.manager_comment && (
                <p className="truncate text-xs text-muted-foreground" title={leave.manager_comment}>
                  Manager: {leave.manager_comment}
                </p>
              )}
            </TableCell>
            <TableCell><StatusBadge status={leave.status} /></TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(leave.created_at)}</TableCell>
            {renderActions && <TableCell className="text-right">{renderActions(leave)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
