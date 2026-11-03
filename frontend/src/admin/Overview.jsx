import { useEffect, useState } from 'react'
import { api } from '../api'
import { fmtDate, inr } from '../format'
import { ErrorNote, Loading } from '../ui'

function Stat({ label, value }) {
  return (
    <div className="panel p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold">{value}</p>
    </div>
  )
}

function AvailabilityBar({ a }) {
  const total = a.available + a.locked + a.booked
  const pct = (n) => `${(n / total) * 100}%`
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-line" role="img" aria-label={`${a.booked} booked, ${a.locked} held, ${a.available} available`}>
        <div className="bg-brand" style={{ width: pct(a.booked) }} />
        <div className="bg-saffron" style={{ width: pct(a.locked) }} />
      </div>
      <div className="mt-2 flex gap-5 text-xs text-muted">
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-brand" />{a.booked} booked</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-saffron" />{a.locked} held</span>
        <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-line" />{a.available} available</span>
      </div>
    </div>
  )
}

export default function Overview() {
  const [stats, setStats] = useState(null)
  const [popular, setPopular] = useState([])
  const [events, setEvents] = useState([])
  const [seatRows, setSeatRows] = useState([])
  const [eventId, setEventId] = useState('')
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/admin/stats'), api.get('/reports/popular-events?limit=5'),
      api.get('/admin/events'), api.get('/reports/seat-availability'),
    ])
      .then(([s, p, e, a]) => { setStats(s); setPopular(p); setEvents(e); setSeatRows(a) })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!eventId) return setDetail(null)
    Promise.all([api.get(`/reports/revenue/${eventId}`), api.get(`/reports/seat-availability/${eventId}`)])
      .then(([revenue, availability]) => { setDetail({ revenue, availability }); setError('') })
      .catch((e) => { setDetail(null); setError(e.message) })
  }, [eventId])

  if (!stats) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />
  const max = Math.max(1, ...popular.map((p) => p.tickets_sold))

  return (
    <div className="space-y-8">
      <ErrorNote>{error}</ErrorNote>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Revenue" value={inr(stats.revenue)} />
        <Stat label="Tickets sold" value={stats.tickets_sold} />
        <Stat label="Confirmed bookings" value={stats.confirmed_bookings} />
        <Stat label="Customers" value={stats.users} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-display text-xl font-bold">Most popular events</h2>
          <p className="mb-4 text-sm text-muted">By tickets sold, cancellations excluded.</p>
          {popular.length === 0 ? <p className="text-sm text-muted">No tickets sold yet.</p> : (
            <ol className="space-y-3">
              {popular.map((p) => (
                <li key={p.event_id}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{p.event_name}</span>
                    <span className="text-muted">{p.tickets_sold}</span>
                  </div>
                  <div className="h-2 rounded-full bg-line"><div className="h-2 rounded-full bg-brand" style={{ width: `${(p.tickets_sold / max) * 100}%` }} /></div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="font-display text-xl font-bold">Event report</h2>
          <p className="mb-4 text-sm text-muted">Revenue and seat availability for one event.</p>
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="Event" className="input mb-5">
            <option value="">Choose an event</option>
            {events.map((e) => <option key={e.event_id} value={e.event_id}>{e.event_name}</option>)}
          </select>
          {detail && (
            <div className="space-y-4">
              <div>
                <p className="font-display text-3xl font-extrabold">{inr(detail.revenue.total_revenue)}</p>
                <p className="text-sm text-muted">from {detail.revenue.tickets_sold} tickets</p>
              </div>
              <AvailabilityBar a={detail.availability} />
            </div>
          )}
        </section>
      </div>

      <section className="panel overflow-hidden">
        <div className="p-5 pb-3">
          <h2 className="font-display text-xl font-bold">Seats by event</h2>
          <p className="text-sm text-muted">Available and booked seats for every event, read from the database views.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-y border-line text-muted">
              <tr>{['Event', 'Date', 'Venue', 'Booked', 'Available', 'Revenue'].map((h) => <th key={h} className="px-5 py-2.5 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {seatRows.map((r) => {
                const pct = r.seats_total ? (r.seats_booked / r.seats_total) * 100 : 0
                return (
                  <tr key={r.event_id}>
                    <td className="px-5 py-3 font-semibold">{r.event_name}</td>
                    <td className="whitespace-nowrap px-5 py-3">{fmtDate(r.event_date)}</td>
                    <td className="px-5 py-3">{r.venue_name}<span className="text-muted">, {r.city}</span></td>
                    <td className="min-w-[160px] px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-2 flex-1 rounded-full bg-line" role="img" aria-label={`${Math.round(pct)}% booked`}>
                          <div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-16 text-right tabular-nums">{r.seats_booked}<span className="text-muted">/{r.seats_total}</span></span>
                      </div>
                    </td>
                    <td className={`px-5 py-3 tabular-nums ${r.seats_available === 0 ? 'font-semibold text-rose' : ''}`}>
                      {r.seats_available === 0 ? 'Sold out' : r.seats_available}
                    </td>
                    <td className="px-5 py-3 font-semibold tabular-nums">{inr(r.revenue)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
