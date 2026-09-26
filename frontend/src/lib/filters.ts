/** Value of the "All …" option in filter selects. */
export const ALL = 'all'

type Option = { value: string; label: string }

export const optionsFrom = (allLabel: string, values: (string | Option)[]): Option[] => [
  { value: ALL, label: allLabel },
  ...values.map((v) => (typeof v === 'string' ? { value: v, label: v } : v)),
]
