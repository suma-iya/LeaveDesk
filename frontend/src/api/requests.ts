import type { Decision, LeaveRequest, ListRequestsParams, Page, RequestDetail, RequestInput, RequestRow } from '@/types'
import { request, toQuery } from './http'

export const requestsApi = {
  listRequests: (p: ListRequestsParams) =>
    request<Page<RequestRow>>(`/requests${toQuery({
      status: p.status, type: p.type, department: p.department, from: p.from, to: p.to,
      year: p.year, q: p.q, mine: p.mine, page: p.page, pageSize: p.pageSize,
    })}`),
  getRequest: (id: string) => request<RequestDetail>(`/requests/${id}`),
  createRequest: (input: RequestInput) => request<LeaveRequest>('/requests', { method: 'POST', body: input }),
  updateRequest: (id: string, input: RequestInput) => request<LeaveRequest>(`/requests/${id}`, { method: 'PUT', body: input }),
  cancelRequest: (id: string) => request<void>(`/requests/${id}`, { method: 'DELETE' }),
  decideRequest: (id: string, decision: Decision) =>
    request<LeaveRequest>(`/requests/${id}/decision`, { method: 'POST', body: decision }),
  bulkDecide: (ids: string[], decision: Decision) =>
    request<LeaveRequest[]>('/requests/decisions', { method: 'POST', body: { ids, ...decision } }),
  reopenRequest: (id: string) => request<LeaveRequest>(`/requests/${id}/decision`, { method: 'DELETE' }),
}
