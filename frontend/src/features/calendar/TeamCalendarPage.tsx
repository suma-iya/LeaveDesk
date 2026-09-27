import { useEffect } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { HeaderActions } from '@/layouts/HeaderActions'
import { TeamCalendarView } from './TeamCalendarView'

/** /calendar (both roles): a normal page in the app shell, opened from the header's calendar icon. */
export function TeamCalendarPage() {
  useEffect(() => {
    const previous = document.title
    document.title = 'Team calendar · LeaveDesk'
    return () => { document.title = previous }
  }, [])

  // Desktop: exactly the viewport height (main's py-7 is 3.5rem), so the
  // month fills the space below the header without a page scroll.
  return (
    <div className="flex flex-col gap-5 md:h-[calc(100svh-3.5rem)]">
      <PageHeader title="Team calendar" subtitle="Click a day to see who is away. Fri and Sat are weekend."
        actions={<HeaderActions />} />
      <TeamCalendarView />
    </div>
  )
}
