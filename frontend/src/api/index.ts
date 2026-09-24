import type { LeaveApi } from './contract'
import { authApi } from './auth'
import { balancesApi } from './balances'
import { calendarApi } from './calendar'
import { mockApi } from './mock'
import { profileApi } from './profile'
import { requestsApi } from './requests'

export { ApiError } from './contract'
export { tokenStore } from './http'

const httpApi: LeaveApi = { ...authApi, ...requestsApi, ...balancesApi, ...calendarApi, ...profileApi }

/**
 * VITE_USE_MOCK=true (the default until the Go endpoints exist) serves every
 * call from in-memory seed data. Set VITE_USE_MOCK=false to call /api.
 */
export const useMock = import.meta.env.VITE_USE_MOCK !== 'false'

export const api: LeaveApi = useMock ? mockApi : httpApi
