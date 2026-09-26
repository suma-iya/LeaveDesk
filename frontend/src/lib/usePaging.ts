import { useState } from 'react'

/** Page number that goes back to 1 whenever the filters change. */
export function usePaging(filtersKey: string, pageSize = 8) {
  const [state, setState] = useState({ key: filtersKey, page: 1 })
  if (state.key !== filtersKey) setState({ key: filtersKey, page: 1 }) // adjust during render
  return { page: state.key === filtersKey ? state.page : 1, pageSize, setPage: (page: number) => setState({ key: filtersKey, page }) }
}
