import type { QueryClient } from '@tanstack/react-query'
import { keys } from './queries'

/** After any change to a request, refetch everything that shows requests or balances. */
export function invalidateLeaveData(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: keys.requests }),
    queryClient.invalidateQueries({ queryKey: ['request'] }),
    queryClient.invalidateQueries({ queryKey: ['balances'] }),
    queryClient.invalidateQueries({ queryKey: keys.calendar }),
  ])
}
