import { useEffect, useState } from 'react'

/** The value, updated only after it stops changing for `ms` milliseconds. */
export function useDebounced<T>(value: T, ms = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}
