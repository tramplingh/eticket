import { useEffect, useState } from 'react'
import { api } from '../api'

export default function Reports() {
  const [popular, setPopular] = useState([])
  const [eventId, setEventId] = useState('')
  const [revenue, setRevenue] = useState(null)
  const [availability, setAvailability] = useState(null)
  const [date, setDate] = useState('')
  const [dateBookings, setDateBookings] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/reports/popular-events?limit=5').then(setPopular).catch((e) => setError(e.message))
  }, [])

  const lookupEvent = async () => {
    if (!eventId) return
    setError('')
    try {
      const [rev, avail] = await Promise.all([
        api.get(`/reports/revenue/${eventId}`),
        api.get(`/reports/seat-availability/${eventId}`),
      ])
      setRevenue(rev)
      setAvailability(avail)
    } catch (err) {
      setError(err.message)
    }
  }

  const lookupDate = async () => {
    if (!date) return
    setError('')
    try {
      setDateBookings(await api.get(`/reports/bookings-by-date?booking_date=${date}`))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reports</h1>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="font-medium mb-3">Most popular events</h2>
        <ol className="space-y-1 text-sm">
          {popular.map((p, i) => (
            <li key={p.event_id}>{i + 1}. {p.event_name} — {p.tickets_sold} tickets sold</li>
          ))}
          {popular.length === 0 && <p className="text-slate-500">No data yet.</p>}
        </ol>
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="font-medium mb-3">Event revenue & seat availability</h2>
        <div className="flex gap-2 mb-3">
          <input
            placeholder="Event ID"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="border rounded px-2 py-1 w-32"
          />
          <button onClick={lookupEvent} className="bg-slate-900 text-white rounded px-4 py-1.5 hover:bg-slate-800">
            Look up
          </button>
        </div>
        {revenue && (
          <p className="text-sm">
            <strong>{revenue.event_name}</strong>: ₹{revenue.total_revenue} revenue from {revenue.tickets_sold} tickets
          </p>
        )}
        {availability && (
          <p className="text-sm text-slate-500">
            Seats — available: {availability.available}, locked: {availability.locked}, booked: {availability.booked}
          </p>
        )}
      </div>

      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="font-medium mb-3">Bookings on a date</h2>
        <div className="flex gap-2 mb-3">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border rounded px-2 py-1" />
          <button onClick={lookupDate} className="bg-slate-900 text-white rounded px-4 py-1.5 hover:bg-slate-800">
            Look up
          </button>
        </div>
        <ul className="text-sm space-y-1">
          {dateBookings.map((b) => (
            <li key={b.booking_id}>Booking #{b.booking_id} — {b.booking_status} — ₹{b.total_amount}</li>
          ))}
          {dateBookings.length === 0 && <p className="text-slate-500">No bookings for that date.</p>}
        </ul>
      </div>
    </div>
  )
}
