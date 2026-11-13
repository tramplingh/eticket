import { useEffect, useState } from 'react'
import { api } from '../api'
import { fmtDate, fmtDateTime, inr, isPast } from '../format'
import { Empty, ErrorNote, Loading, Pill } from '../ui'
import { BOOKING_PERIOD_GROUPS, WhenFilter, applyWhen, defaultWhen } from '../when'

const LIMIT = 500 // BOOKING_LIMIT in backend/app/routers/admin.py
const DEFAULT_FILTERS = { q: '', event_when: 'any', event_id: '', status: '', ...defaultWhen('all', -30) }

export default function BookingsTab() {
  const [bookings, setBookings] = useState(null)
  const [events, setEvents] = useState([])
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [error, setError] = useState('')

  const params = new URLSearchParams()
  const { label, window: dates } = applyWhen(BOOKING_PERIOD_GROUPS, filters, params, 'booking_date')
  if (filters.event_when !== 'any') params.set('event_when', filters.event_when)
  if (filters.event_id) params.set('event_id', filters.event_id)
  if (filters.status) params.set('status', filters.status)
  if (filters.q) params.set('q', filters.q)
  const query = params.toString()

  useEffect(() => { api.get('/admin/events').then(setEvents).catch(() => {}) }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/admin/bookings?${query}`)
        .then((b) => { setBookings(b); setError('') })
        .catch((e) => { setError(e.message); setBookings([]) })
    }, 250) // typing in the search box is debounced
    return () => clearTimeout(t)
  }, [query])

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value })
  const filtered = query !== 'period=all'
  const upcoming = events.filter((e) => !isPast(e.event_date)).sort((a, b) => a.event_date.localeCompare(b.event_date))
  const past = events.filter((e) => isPast(e.event_date))

  const paid = (bookings || []).reduce((n, b) => n + Number(b.payment ? b.payment.amount : b.total_amount), 0)
  const refunded = (bookings || []).reduce((n, b) => n + Number(b.payment?.refunded_amount || 0), 0)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search" value={filters.q} onChange={set('q')} placeholder="Customer name or email"
          aria-label="Search customers" className="input min-w-[180px] flex-1"
        />
        <WhenFilter groups={BOOKING_PERIOD_GROUPS} value={filters} onChange={setFilters} label="Booked" />
        <select value={filters.event_when} onChange={set('event_when')} aria-label="Event timing" className="input w-auto">
          <option value="any">Any event</option>
          <option value="upcoming">Upcoming events</option>
          <option value="past">Past events</option>
        </select>
        <select value={filters.event_id} onChange={set('event_id')} aria-label="Event" className="input w-auto max-w-[260px]">
          <option value="">All events</option>
          <optgroup label="Upcoming">
            {upcoming.map((e) => <option key={e.event_id} value={e.event_id}>{e.event_name}</option>)}
          </optgroup>
          <optgroup label="Already happened">
            {past.map((e) => <option key={e.event_id} value={e.event_id}>{e.event_name} ({fmtDate(e.event_date)})</option>)}
          </optgroup>
        </select>
        <select value={filters.status} onChange={set('status')} aria-label="Status" className="input w-auto">
          <option value="">Any status</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
          <option value="pending">Pending</option>
        </select>
        {filtered && <button onClick={() => setFilters(DEFAULT_FILTERS)} className="btn-ghost btn-sm">Clear filters</button>}
      </div>

      <p className="mb-4 text-sm text-muted" aria-live="polite">
        <b className="font-semibold text-ink">{label}</b>: bookings made {dates}
        {filters.event_when !== 'any' && <>, for {filters.event_when} events</>}
        {bookings && !error && (
          <> · {bookings.length === LIMIT ? `latest ${LIMIT}` : bookings.length} {bookings.length === 1 ? 'booking' : 'bookings'} · {inr(paid)} paid{refunded > 0 && <> · {inr(refunded)} refunded</>}</>
        )}
      </p>

      <ErrorNote>{error}</ErrorNote>
      {bookings === null ? <Loading /> : bookings.length === 0 ? (
        <Empty title="No bookings">{filtered ? 'Nothing matches these filters. Try a wider time range.' : 'No one has booked yet.'}</Empty>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>{['Booking', 'Customer', 'Event', 'Seats', 'Paid', 'Status'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {bookings.map((b) => {
                const first = b.tickets[0]
                return (
                  <tr key={b.booking_id} className="align-top">
                    <td className="px-4 py-3"><p className="font-semibold">#{b.booking_id}</p><p className="text-xs text-muted">{fmtDateTime(b.booking_date)}</p></td>
                    <td className="px-4 py-3"><p>{b.user_name}</p><p className="text-xs text-muted">{b.user_email}</p></td>
                    <td className="px-4 py-3">
                      {first ? (
                        <>
                          <p>{first.event_name}</p>
                          <p className="text-xs text-muted">
                            {fmtDate(first.event_date)}
                            {isPast(first.event_date) && <span className="ml-2"><Pill>Event over</Pill></span>}
                          </p>
                        </>
                      ) : <span className="text-muted">n/a</span>}
                    </td>
                    <td className="px-4 py-3">
                      {b.tickets.map((t, i) => (
                        <span key={t.ticket_id} className={t.ticket_status === 'cancelled' ? 'text-muted line-through' : ''}>
                          {i > 0 && ', '}{t.row_num}{t.seat_number}
                        </span>
                      ))}
                      {b.tickets.some((t) => t.ticket_status === 'used') && (
                        <p className="text-xs text-muted">{b.tickets.filter((t) => t.ticket_status === 'used').length} checked in</p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="font-semibold">{inr(b.payment ? b.payment.amount : b.total_amount)}</p>
                      {b.payment && Number(b.payment.refunded_amount) > 0 && (
                        <p className="text-xs text-brand">{inr(b.payment.refunded_amount)} refunded</p>
                      )}
                    </td>
                    <td className="px-4 py-3"><Pill>{b.booking_status}</Pill></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
