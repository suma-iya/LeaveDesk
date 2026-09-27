import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api'
import { refreshLeaveData } from '@/api/queries'
import { formatRange } from '@/lib/dates'
import { fullName } from '@/lib/format'
import type { LeaveRequest } from '@/types'

// Approve / reject with Undo. There is no undo endpoint: the decision is
// held for 5 seconds (the row is hidden meanwhile) and only then sent.
// Timers live here, outside React, so leaving the page doesn't lose them;
// if the tab closes, pending decisions are sent with fetch keepalive.

const UNDO_MS = 5000

interface Held {
  request: LeaveRequest
  status: 'approved' | 'rejected'
  note: string
  timer: ReturnType<typeof setTimeout>
  /** The Undo toast, closed once the decision is sent. */
  toastId?: string | number
  /** Set when sending starts, so nothing sends it twice. */
  sent?: boolean
}

const held = new Map<number, Held>()
const listeners = new Set<() => void>()
let snapshot = new Set<number>()

function changed() {
  snapshot = new Set(held.keys())
  listeners.forEach((l) => l())
}

// The row stays hidden until the request finishes; `sent` stops a second
// send (e.g. pagehide again after a back/forward-cache restore) and a late
// Undo. The toast is closed here because sonner pauses its own timer while
// hovered, so it could otherwise outlive the Undo window.
async function send(item: Held, client: QueryClient | null, keepalive = false) {
  if (item.sent) return
  item.sent = true
  clearTimeout(item.timer)
  if (item.toastId !== undefined) toast.dismiss(item.toastId)
  try {
    await api.requests.decide(item.request.id, item.status, item.note, keepalive)
  } catch (error) {
    toast.error(`${fullName(item.request.employee)}: ${(error as Error).message}`)
  } finally {
    held.delete(item.request.id)
    changed()
    if (client) void refreshLeaveData(client)
  }
}

export function decideWithUndo(client: QueryClient, request: LeaveRequest, status: 'approved' | 'rejected', note = '') {
  const item: Held = { request, status, note, timer: setTimeout(() => void send(item, client), UNDO_MS) }
  held.set(request.id, item)
  changed()
  item.toastId = toast.success(`${status === 'approved' ? 'Approved' : 'Rejected'} ${fullName(request.employee)}’s leave (${formatRange(request.startDate, request.endDate)})`, {
    duration: UNDO_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        if (item.sent) return
        clearTimeout(item.timer)
        held.delete(request.id)
        changed()
      },
    },
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    held.forEach((item) => void send(item, null, true))
  })
}

/** Ids whose decision is waiting out its Undo window (hide those rows). */
export function useHeldDecisions() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => snapshot,
    () => snapshot,
  )
}
