import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import Ticket from '../components/Ticket'
import { fmtDateTime, inr, isPast } from '../format'
import { Empty, ErrorNote, Loading, Pill, useToast } from '../ui'

/** Two-step "Cancel this ticket" control shown on each active ticket. */
function CancelTicket({ t, onChanged }) {
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const cancel = async () => {
    setBusy(true)
    try {
      await api.post(`/tickets/${t.ticket_id}/cancel`)
      toast(`Seat ${t.row_num}${t.seat_number} cancelled. ${inr(t.ticket_price)} will be refunded.`)
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
      setBusy(false)
      setConfirming(false)
    }
  }

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="text-sm font-semibold text-rose hover:underline">
        Cancel this ticket
      </button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">Cancel seat {t.row_num}{t.seat_number} and refund {inr(t.ticket_price)}?</span>
      <button onClick={() => setConfirming(false)} className="btn-ghost btn-sm">Keep it</button>
      <button onClick={cancel} disabled={busy} className="btn-danger btn-sm">{busy ? 'Cancelling…' : 'Cancel ticket'}</button>
    </div>
  )
}

function PaymentLine({ b }) {
  const p = b.payment
  if (!p) return null
  const refunded = Number(p.refunded_amount)
  if (p.payment_status === 'refunded') return <> · {inr(refunded)} refunded</>
  if (p.payment_status === 'partially_refunded') {
    return <> · paid {inr(p.amount)} by {p.payment_method}, {inr(refunded)} refunded</>
  }
  return <> · paid by {p.payment_method}</>
}

function BookingCard({ b, onChanged }) {
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)

  const cancelled = b.booking_status === 'cancelled'
  const eventPassed = b.tickets.some((t) => t.event_date && isPast(t.event_date))
  const anyUsed = b.tickets.some((t) => t.ticket_status === 'used')
  const live = b.tickets.filter((t) => t.ticket_status !== 'cancelled')
  const cancelledCount = b.tickets.length - live.length
  const canCancel = !cancelled && !eventPassed && !anyUsed

  const cancel = async () => {
    setBusy(true)
    try {
      await api.post(`/bookings/${b.booking_id}/cancel`)
      toast('Booking cancelled. Your seats are released and the payment is refunded.')
      onChanged()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-xl font-bold">Booking #{b.booking_id}</h2>
            <Pill>{b.booking_status}</Pill>
            {b.payment?.payment_status === 'partially_refunded' && <Pill>partially refunded</Pill>}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {fmtDateTime(b.booking_date)} · {cancelled
              ? `${b.tickets.length} ${b.tickets.length === 1 ? 'ticket' : 'tickets'}`
              : `${live.length} ${live.length === 1 ? 'ticket' : 'tickets'} · ${inr(b.total_amount)}`}
            {!cancelled && cancelledCount > 0 && <> ({cancelledCount} cancelled)</>}
            <PaymentLine b={b} />
          </p>
        </div>

        {canCancel && (confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Cancel all {live.length} and refund {inr(b.total_amount)}?</span>
            <button onClick={() => setConfirming(false)} className="btn-ghost btn-sm">Keep booking</button>
            <button onClick={cancel} disabled={busy} className="btn-danger btn-sm">{busy ? 'Cancelling…' : 'Cancel booking'}</button>
          </div>
        ) : (
          <button onClick={() => setConfirming(true)} className="btn-ghost btn-sm text-rose">Cancel booking</button>
        ))}
      </div>

      {b.tickets.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {b.tickets.map((t) => (
            <Ticket
              key={t.ticket_id}
              t={t}
              action={canCancel && t.ticket_status === 'active' && live.length > 1
                ? <CancelTicket t={t} onChanged={onChanged} />
                : null}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function MyBookings() {
  const [bookings, setBookings] = useState(null)
  const [error, setError] = useState('')

  const load = async () => {
    try { setBookings(await api.get('/bookings/me')) } catch (err) { setError(err.message); setBookings([]) }
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <h1 className="font-display text-4xl font-extrabold">My bookings</h1>
      <p className="mb-6 mt-1 text-muted">Cancel a single seat or the whole booking any time before the event. Refunds go back to the original payment method.</p>
      <ErrorNote>{error}</ErrorNote>
      {bookings === null ? <Loading /> : bookings.length === 0 && !error ? (
        <Empty title="No bookings yet">
          When you book seats they'll show up here with their tickets. <Link to="/events" className="font-semibold text-brand">Browse events</Link>
        </Empty>
      ) : (
        <div className="space-y-5">{bookings.map((b) => <BookingCard key={b.booking_id} b={b} onChanged={load} />)}</div>
      )}
    </div>
  )
}
