import { useCallback, useEffect, useState } from 'react'

// Runs an async loader and tracks the three states every page must handle:
// loading, error and data. Call reload() after a change to refetch.
export function useAsync(loader, deps) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let ignore = false // drop results from a request that is no longer current
    setLoading(true)
    setError(null)
    loader()
      .then((result) => { if (!ignore) setData(result) })
      .catch((err) => { if (!ignore) setError(err) })
      .finally(() => { if (!ignore) setLoading(false) })
    return () => { ignore = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  return { data, error, loading, reload }
}
