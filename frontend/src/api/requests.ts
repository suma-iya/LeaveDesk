import type { Balance, Draft, LeaveRequest, Page, RequestFilters } from '@/types'
import { request, toQuery } from './http'

const filterQuery = (f: RequestFilters) =>
  toQuery({ scope: f.scope, status: f.status, type: f.type, department: f.department, q: f.q, year: f.year, from: f.from, to: f.to, page: f.page, pageSize: f.pageSize })

export const requestsApi = {
  list: (f: RequestFilters) => request<Page<LeaveRequest> & { pageSize: number }>(`/requests${filterQuery(f)}`),
  get: (id: number | string) => request<{ request: LeaveRequest; balances: Balance[] }>(`/requests/${id}`),
  create: (draft: Draft) => request<LeaveRequest>('/requests', { method: 'POST', body: draft }),
  update: (id: number, draft: Draft) => request<LeaveRequest>(`/requests/${id}`, { method: 'PATCH', body: draft }),
  cancel: (id: number) => request<LeaveRequest>(`/requests/${id}/cancel`, { method: 'POST' }),
  decide: (id: number, status: 'approved' | 'rejected', note: string, keepalive = false) =>
    request<LeaveRequest>(`/requests/${id}/decision`, { method: 'POST', body: { status, note }, keepalive }),
  overlaps: (id: number | string) => request<LeaveRequest[]>(`/requests/${id}/overlaps`),
  /** A plain link: the browser downloads the CSV with the session cookie. */
  exportUrl: (f: RequestFilters) => `/api/requests/export.csv${filterQuery({ ...f, page: undefined, pageSize: undefined })}`,
}
