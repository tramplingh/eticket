import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { dayNum, fmtTime, inr, monthShort, weekday } from '../format'
import { Empty, ErrorNote, Loading } from '../ui'

function EventTicket({ ev }) {
  const soldOut = ev.seats_total > 0 && ev.seats_available === 0
  const low = !soldOut && ev.seats_total > 0 && ev.seats_available / ev.seats_total <= 0.2
  return (
    <Link to={`/events/${ev.event_id}`} className="ticket-wrap group block focus-visible:rounded-2xl">
      <div className={`ticket flex ${soldOut ? 'opacity-60' : ''}`} style={{ '--stub': '140px' }}>
        <div className="flex w-20 shrink-0 flex-col items-center justify-center bg-brand py-4 text-white sm:w-24">
          <span className="text-xs font-medium text-white/75">{weekday(ev.event_date)}</span>
          <span className="font-display text-4xl font-extrabold leading-none">{dayNum(ev.event_date)}</span>
          <span className="mt-0.5 text-sm font-semibold">{monthShort(ev.event_date)}</span>
        </div>

        <div className="min-w-0 flex-1 p-4 sm:p-5">
          {ev.event_type && <p className="mb-1 text-xs font-semibold text-brand">{ev.event_type}</p>}
          <p className="font-display text-xl font-bold leading-snug group-hover:text-brand">{ev.event_name}</p>
          <p className="mt-1 text-sm text-muted">{fmtTime(ev.event_time)} · {ev.venue?.venue_name}, {ev.venue?.city}</p>
        </div>

        <div className="perforation my-3 w-0.5 shrink-0 self-stretch" aria-hidden />

        <div className="flex w-[140px] shrink-0 flex-col items-end justify-center gap-1 p-4 text-right">
          <p className="text-xs text-muted">{soldOut ? 'Status' : 'From'}</p>
          <p className="font-display text-xl font-extrabold">{soldOut ? 'Sold out' : inr(ev.base_price)}</p>
          {low && <p className="text-xs font-semibold text-[#A9781B]">{ev.seats_available} seats left</p>}
        </div>
      </div>
    </Link>
  )
}

export default function Events() {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState('')
  const [types, setTypes] = useState([])
  const [venues, setVenues] = useState([])
  const [filters, setFilters] = useState({ q: '', event_type: '', event_date: '', venue_id: '' })

  useEffect(() => {
    api.get('/events/types').then(setTypes).catch(() => {})
    api.get('/venues').then(setVenues).catch(() => {})
  }, [])

  // Re-query as filters change (typing is debounced).
  useEffect(() => {
    const t = setTimeout(async () => {
      setError('')
      try {
        const params = new URLSearchParams()
        Object.entries(filters).forEach(([k, v]) => v && params.set(k, v))
        setEvents(await api.get(`/events?${params}`))
      } catch (err) {
        setError(err.message)
        setEvents([])
      }
    }, 250)
    return () => clearTimeout(t)
  }, [filters])

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value })
  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <div>
      <div className="mb-8 max-w-2xl">
        <h1 className="font-display text-4xl font-extrabold sm:text-5xl">What's on</h1>
        <p className="mt-2 text-muted">Concerts, matches and shows. Pick an event, choose your seats, and your tickets are ready in seconds.</p>
      </div>

      <div className="panel mb-4 flex flex-wrap items-center gap-3 p-3">
        <input
          type="search" value={filters.q} onChange={set('q')} placeholder="Search events"
          aria-label="Search events" className="input min-w-[200px] flex-1"
        />
        <select value={filters.venue_id} onChange={set('venue_id')} aria-label="Venue" className="input w-auto">
          <option value="">All venues</option>
          {venues.map((v) => <option key={v.venue_id} value={v.venue_id}>{v.venue_name} ({v.city})</option>)}
        </select>
        <input type="date" value={filters.event_date} onChange={set('event_date')} aria-label="Date" className="input w-auto" />
        {hasFilters && (
          <button onClick={() => setFilters({ q: '', event_type: '', event_date: '', venue_id: '' })} className="btn-ghost btn-sm">
            Clear filters
          </button>
        )}
      </div>

      {types.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Event type">
          {['', ...types].map((t) => (
            <button
              key={t || 'all'}
              onClick={() => setFilters({ ...filters, event_type: t })}
              aria-pressed={filters.event_type === t}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                filters.event_type === t ? 'border-ink bg-ink text-white' : 'border-line bg-white text-muted hover:border-ink/40 hover:text-ink'
              }`}
            >
              {t || 'All'}
            </button>
          ))}
        </div>
      )}

      <ErrorNote>{error}</ErrorNote>
      {events === null ? (
        <Loading label="Loading events" />
      ) : events.length === 0 && !error ? (
        <Empty title="No events match">Try a different date or venue, or clear the filters.</Empty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {events.map((ev) => <EventTicket key={ev.event_id} ev={ev} />)}
        </div>
      )}
    </div>
  )
}
