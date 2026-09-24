/** Value of the "All …" option in filter selects. */
export const ALL = 'all'

export const optionsFrom = (allLabel: string, values: string[]) => [
  { value: ALL, label: allLabel },
  ...values.map((v) => ({ value: v, label: v })),
]
