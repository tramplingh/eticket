import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, getToken } from '../api'
import Ticket from '../components/Ticket'
import { fmtDate, fmtTime, inr } from '../format'
import { ErrorNote, Loading } from '../ui'

const METHODS = [
  { id: 'card', label: 'Card' },
  { id: 'upi', label: 'UPI' },
  { id: 'netbanking', label: 'Net banking' },
  { id: 'wallet', label: 'Wallet' },
]

export default function EventSeats({ user }) {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const [event, setEvent] = useState(null)
  const [seats, setSeats] = useState([])
  const [selected, setSelected] = useState([])
  const [method, setMethod] = useState('card')
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(null)
  const [booking, setBooking] = useState(false)

  const load = async () => {
    try {
      const [ev, sts] = await Promise.all([api.get(`/events/${eventId}`), api.get(`/events/${eventId}/seats`)])
      setEvent(ev)
      setSeats(sts)
    } catch (err) {
      setError(err.message)
    }
  }
  useEffect(() => { load() }, [eventId])

  const rows = useMemo(() => {
    const map = new Map()
    seats.forEach((s) => {
      if (!map.has(s.seat.row_num)) map.set(s.seat.row_num, [])
      map.get(s.seat.row_num).push(s)
    })
    return [...map.entries()]
  }, [seats])

  const tiers = useMemo(() => {
    const m = new Map()
    seats.forEach((s) => m.set(Number(s.price), s.seat.seat_type))
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [seats])

  const chosen = seats.filter((s) => selected.includes(s.event_seat_id))
  const total = chosen.reduce((sum, s) => sum + Number(s.price), 0)
  const availableCount = seats.filter((s) => s.availability_status === 'available').length

  const toggle = (s) => {
    if (s.availability_status !== 'available') return
    setSelected((prev) =>
      prev.includes(s.event_seat_id)
        ? prev.filter((id) => id !== s.event_seat_id)
        : prev.length >= 10 ? prev : [...prev, s.event_seat_id]
    )
  }

  const handleBook = async () => {
    if (!getToken()) return navigate('/login', { state: { from: `/events/${eventId}` } })
    setBooking(true)
    setError('')
    try {
      const res = await api.post('/bookings', { event_seat_ids: selected, payment_method: method })
      setConfirmed(res)
      setSelected([])
      load()
    } catch (err) {
      setError(err.message)
      setSelected([])
      load() // someone may have taken a seat: refresh the map
    } finally {
      setBooking(false)
    }
  }

  if (!event) return error ? <ErrorNote>{error}</ErrorNote> : <Loading label="Loading seats" />

  if (confirmed) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-mint text-white" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <div>
            <h1 className="font-display text-3xl font-extrabold">Booking confirmed</h1>
            <p className="text-sm text-muted">
              Booking #{confirmed.booking_id} · {inr(confirmed.total_amount)} paid by {confirmed.payment?.payment_method}
            </p>
          </div>
        </div>
        <div className="space-y-4">
          {confirmed.tickets.map((t) => <Ticket key={t.ticket_id} t={t} />)}
        </div>
        <div className="mt-6 flex gap-3">
          <Link to="/my-bookings" className="btn-primary">View my bookings</Link>
          <button onClick={() => setConfirmed(null)} className="btn-ghost">Book more seats</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link to="/events" className="text-sm font-medium text-muted hover:text-ink">← All events</Link>
      <div className="mb-8 mt-3">
        {event.event_type && <p className="mb-1 text-sm font-semibold text-brand">{event.event_type}</p>}
        <h1 className="font-display text-4xl font-extrabold">{event.event_name}</h1>
        <p className="mt-2 text-muted">
          {fmtDate(event.event_date)} at {fmtTime(event.event_time)} · {event.venue?.venue_name}, {event.venue?.city}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="panel p-5 sm:p-8" aria-label="Seat map">
          <div className="mx-auto mb-10 max-w-md">
            <div className="stage h-10" />
            <p className="mt-2 text-center text-xs font-medium text-muted">Stage</p>
          </div>

          <div className="space-y-3 overflow-x-auto pb-2">
            {rows.map(([row, list]) => (
              <div key={row} className="flex items-center justify-center gap-3">
                <span className="w-6 shrink-0 text-right font-display text-sm font-bold text-muted">{row}</span>
                <div className="flex gap-1.5">
                  {list.map((s) => {
                    const on = selected.includes(s.event_seat_id)
                    const cls = on ? 'seat-selected' : `seat-${s.availability_status}`
                    return (
                      <button
                        key={s.event_seat_id}
                        onClick={() => toggle(s)}
                        disabled={s.availability_status !== 'available'}
                        aria-pressed={on}
                        aria-label={`Row ${row} seat ${s.seat.seat_number}, ${s.availability_status}, ${inr(s.price)}`}
                        title={`${row}${s.seat.seat_number}${s.seat.seat_type ? ' · ' + s.seat.seat_type : ''} · ${inr(s.price)}`}
                        className={`seat ${cls}`}
                      >
                        {s.seat.seat_number}
                      </button>
                    )
                  })}
                </div>
                <span className="w-6 shrink-0" aria-hidden />
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-line pt-5 text-xs text-muted">
            <span className="flex items-center gap-2"><i className="seat seat-available !h-4 !w-4 !rounded-md" />Available</span>
            <span className="flex items-center gap-2"><i className="seat seat-selected !h-4 !w-4 !rounded-md" />Your pick</span>
            <span className="flex items-center gap-2"><i className="seat seat-booked !h-4 !w-4 !rounded-md" />Booked</span>
            <span className="flex items-center gap-2"><i className="seat seat-locked !h-4 !w-4 !rounded-md" />Held</span>
          </div>
          {tiers.length > 1 && (
            <p className="mt-3 text-center text-xs text-muted">
              {tiers.map(([price, type]) => `${type || 'Standard'} ${inr(price)}`).join(' · ')}
            </p>
          )}
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="panel p-5">
            <h2 className="font-display text-xl font-bold">Your seats</h2>
            <p className="text-sm text-muted">{availableCount} of {seats.length} still available</p>

            <ErrorNote>{error}</ErrorNote>

            <div className="my-4 min-h-[3.5rem]">
              {chosen.length === 0 ? (
                <p className="text-sm text-muted">Select up to 10 seats on the map.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {chosen.map((s) => (
                    <li key={s.event_seat_id} className="flex items-center justify-between py-2 text-sm">
                      <span><b className="font-display">{s.seat.row_num}{s.seat.seat_number}</b> <span className="text-muted">{s.seat.seat_type}</span></span>
                      <span className="font-semibold">{inr(s.price)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <fieldset className="mb-4">
              <legend className="label">Pay with</legend>
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map((m) => (
                  <label key={m.id} className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors ${method === m.id ? 'border-brand bg-brand-soft text-brand' : 'border-line hover:border-ink/40'}`}>
                    <input type="radio" name="method" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="sr-only" />
                    {m.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex items-baseline justify-between border-t border-line pt-4">
              <span className="text-sm text-muted">Total</span>
              <span className="font-display text-3xl font-extrabold">{inr(total)}</span>
            </div>
            <button onClick={handleBook} disabled={selected.length === 0 || booking} className="btn-primary mt-4 w-full py-3">
              {booking ? 'Booking…' : user ? `Pay ${inr(total)}` : 'Log in to book'}
            </button>
            <p className="mt-3 text-center text-xs text-muted">Demo checkout. No real payment is taken.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}
