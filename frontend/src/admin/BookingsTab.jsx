import { useEffect, useState } from 'react'
import { api } from '../api'
import { fmtDateTime, inr } from '../format'
import { Empty, ErrorNote, Loading, Pill } from '../ui'

export default function BookingsTab() {
  const [bookings, setBookings] = useState(null)
  const [date, setDate] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setBookings(null)
    api.get(date ? `/reports/bookings-by-date?booking_date=${date}` : '/admin/bookings')
      .then((b) => { setBookings(b); setError('') })
      .catch((e) => { setError(e.message); setBookings([]) })
  }, [date])

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="bdate">Booked on</label>
          <input id="bdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input w-auto" />
        </div>
        {date && <button onClick={() => setDate('')} className="btn-ghost btn-sm mb-1">Show latest</button>}
        <p className="mb-2 ml-auto text-sm text-muted">{date ? 'Bookings on this date' : 'Latest 200 bookings'}</p>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {bookings === null ? <Loading /> : bookings.length === 0 ? <Empty title="No bookings">Nothing was booked on this date.</Empty> : (
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
                    <td className="px-4 py-3">{first?.event_name || <span className="text-muted">n/a</span>}</td>
                    <td className="px-4 py-3">
                      {b.tickets.map((t, i) => (
                        <span key={t.ticket_id} className={t.ticket_status === 'cancelled' ? 'text-muted line-through' : ''}>
                          {i > 0 && ', '}{t.row_num}{t.seat_number}
                        </span>
                      ))}
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
