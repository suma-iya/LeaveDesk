import { differenceInMonths, parseISO } from 'date-fns'

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`

/** 84 KB, 1.2 MB */
export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** BDT 85,000 */
export const formatBDT = (amount: number) => `BDT ${new Intl.NumberFormat('en-US').format(amount)}`

/** Whole years on `today` (never stored; computed from date of birth). */
export function ageOn(dateOfBirth: string, today = new Date()) {
  const dob = parseISO(dateOfBirth)
  let years = today.getFullYear() - dob.getFullYear()
  const beforeBirthday = today.getMonth() < dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())
  if (beforeBirthday) years--
  return years
}

/** "4 years 6 months" since joining. */
export function tenure(joinedOn: string, today = new Date()) {
  const months = Math.max(0, differenceInMonths(today, parseISO(joinedOn)))
  const years = Math.floor(months / 12)
  const rest = months % 12
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (years === 0) return part(rest, 'month')
  if (rest === 0) return part(years, 'year')
  return `${part(years, 'year')} ${part(rest, 'month')}`
}
