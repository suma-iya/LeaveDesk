import { downloadCsv } from '@/lib/csv'
import { formatDate } from '@/lib/dates'
import { fullName } from '@/lib/format'
import type { RequestRow } from '@/types'

export function exportRequests(filename: string, rows: RequestRow[]) {
  downloadCsv(
    filename,
    ['Request', 'Employee', 'Department', 'Leave type', 'From', 'To', 'Working days', 'Status', 'Submitted', 'Decided by', 'Note'],
    rows.map(({ request: r, employee, decidedByName }) => [
      r.id, fullName(employee), employee.department, r.type, formatDate(r.startDate), formatDate(r.endDate),
      r.workingDays, r.status, formatDate(r.submittedAt), decidedByName ?? '', r.decisionNote ?? '',
    ]),
  )
}
