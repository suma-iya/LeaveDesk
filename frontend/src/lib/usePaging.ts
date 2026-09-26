import { useState } from 'react'

export const PAGE_SIZES = [10, 20, 40]

/**
 * Page number and rows-per-page for a server-paged table. The page goes back
 * to 1 whenever the filters (filtersKey) or the page size change.
 */
export function usePaging(filtersKey: string) {
  const [pageSize, setPageSizeState] = useState(PAGE_SIZES[0])
  const [state, setState] = useState({ key: filtersKey, page: 1 })
  if (state.key !== filtersKey) setState({ key: filtersKey, page: 1 }) // adjust during render
  return {
    page: state.key === filtersKey ? state.page : 1,
    pageSize,
    setPage: (page: number) => setState({ key: filtersKey, page }),
    setPageSize: (size: number) => { setPageSizeState(size); setState({ key: filtersKey, page: 1 }) },
  }
}
