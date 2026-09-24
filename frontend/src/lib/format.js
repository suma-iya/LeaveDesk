export const LEAVE_TYPES = [
  { value: 'ANNUAL', label: 'Annual' },
  { value: 'SICK', label: 'Sick' },
  { value: 'CASUAL', label: 'Casual' },
  { value: 'UNPAID', label: 'Unpaid' },
]

export function leaveTypeLabel(value) {
  return LEAVE_TYPES.find((t) => t.value === value)?.label ?? value
}

// Today's date as YYYY-MM-DD in the browser's timezone.
export function todayISO() {
  return new Date().toLocaleDateString('en-CA')
}

// "2026-09-24" → "24 Sep 2026". Parsed as local date to avoid a UTC shift.
export function formatDate(isoDate) {
  if (!isoDate) return '—'
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(timestamp) {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export function formatRange(start, end) {
  return start === end ? formatDate(start) : `${formatDate(start)} → ${formatDate(end)}`
}
