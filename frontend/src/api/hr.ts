import type { Department, EmployeeChange, EmployeeDetail, EmployeeRow, Page } from '@/types'
import { request, toQuery } from './http'

export interface EmployeeFilters {
  q?: string
  department?: number
  page?: number
  pageSize?: number
}

export const hrApi = {
  employees: (f: EmployeeFilters) => request<Page<EmployeeRow>>(`/hr/employees${toQuery({ ...f })}`),
  employee: (id: string) => request<EmployeeDetail>(`/hr/employees/${id}`),
  updateEmployee: (id: string, change: EmployeeChange) =>
    request<EmployeeDetail>(`/hr/employees/${id}`, { method: 'PATCH', body: change }),
  exportUrl: (f: EmployeeFilters) => `/api/hr/employees/export.csv${toQuery({ q: f.q, department: f.department })}`,
  departments: () => request<Department[]>('/departments'),
  createDepartment: (name: string) => request<Department>('/departments', { method: 'POST', body: { name } }),
}
