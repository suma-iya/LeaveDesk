import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/api'
import { refreshLeaveData } from '@/api/queries'
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
}

const held = new Map<number, Held>()
const listeners = new Set<() => void>()
let snapshot = new Set<number>()

function changed() {
  snapshot = new Set(held.keys())
  listeners.forEach((l) => l())
}

async function send(item: Held, client: QueryClient, keepalive = false) {
  try {
    await api.requests.decide(item.request.id, item.status, item.note, keepalive)
  } catch (error) {
    toast.error(`${item.request.code}: ${(error as Error).message}`)
  } finally {
    held.delete(item.request.id)
    changed()
    void refreshLeaveData(client)
  }
}

export function decideWithUndo(client: QueryClient, request: LeaveRequest, status: 'approved' | 'rejected', note = '') {
  const item: Held = { request, status, note, timer: setTimeout(() => void send(item, client), UNDO_MS) }
  held.set(request.id, item)
  changed()
  toast.success(`${status === 'approved' ? 'Approved' : 'Rejected'} ${fullName(request.employee)}’s leave (${request.code})`, {
    duration: UNDO_MS,
    action: {
      label: 'Undo',
      onClick: () => {
        clearTimeout(item.timer)
        held.delete(request.id)
        changed()
      },
    },
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    held.forEach((item) => {
      clearTimeout(item.timer)
      void api.requests.decide(item.request.id, item.status, item.note, true)
    })
  })
}

/** Ids whose decision is waiting out its Undo window (hide those rows). */
export function useHeldDecisions() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l) },
    () => snapshot,
  )
}
