import { useState } from 'react'
import Overview from '../admin/Overview'
import EventsTab from '../admin/EventsTab'
import VenuesTab from '../admin/VenuesTab'
import BookingsTab from '../admin/BookingsTab'
import CheckInTab from '../admin/CheckInTab'

const TABS = [
  { id: 'overview', label: 'Overview', View: Overview },
  { id: 'events', label: 'Events', View: EventsTab },
  { id: 'venues', label: 'Venues & seats', View: VenuesTab },
  { id: 'bookings', label: 'Bookings', View: BookingsTab },
  { id: 'checkin', label: 'Check-in', View: CheckInTab },
]

export default function Admin() {
  const [tab, setTab] = useState(() => sessionStorage.getItem('admin-tab') || 'overview')
  const pick = (id) => { setTab(id); sessionStorage.setItem('admin-tab', id) }
  const View = (TABS.find((t) => t.id === tab) || TABS[0]).View

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">Admin</h1>
      <p className="mt-1 text-muted">Manage events, venues and bookings, and admit ticket holders at the gate.</p>

      <div role="tablist" className="mb-8 mt-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => pick(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === t.id ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <View />
    </div>
  )
}
