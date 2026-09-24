import type { Balance, Policy } from '@/types'
import { request, toQuery } from './http'

export const balancesApi = {
  getBalances: (employeeId: string, year: number) => request<Balance[]>(`/balances${toQuery({ employeeId, year })}`),
  getPolicy: () => request<Policy>('/policy'),
  listDepartments: () => request<string[]>('/departments'),
}
