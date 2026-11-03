import { useEffect, useState } from 'react'
import { api } from '../api'
import { ErrorNote, Field, Loading, useToast } from '../ui'

// "A, B, C" or "A-F" -> ['A','B','C'] / ['A'..'F']
function parseRows(text) {
  const out = []
  text.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).forEach((part) => {
    const m = part.match(/^([A-Z])\s*-\s*([A-Z])$/)
    if (m) {
      for (let c = m[1].charCodeAt(0); c <= m[2].charCodeAt(0); c++) out.push(String.fromCharCode(c))
    } else out.push(part)
  })
  return [...new Set(out)]
}

export default function VenuesTab() {
  const toast = useToast()
  const [venues, setVenues] = useState(null)
  const [error, setError] = useState('')
  const [venueForm, setVenueForm] = useState({ venue_name: '', street: '', city: '', state: '' })
  const [seatForm, setSeatForm] = useState({ venue_id: '', rows: 'A-E', seats_per_row: 10, seat_type: 'Standard' })

  const load = () => api.get('/venues').then(setVenues).catch((e) => setError(e.message))
  useEffect(() => { load() }, [])

  const createVenue = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const v = await api.post('/admin/venues', { ...venueForm, street: venueForm.street || null })
      toast(`Venue "${v.venue_name}" created. Add seats to it next.`)
      setVenueForm({ venue_name: '', street: '', city: '', state: '' })
      setSeatForm((f) => ({ ...f, venue_id: String(v.venue_id) }))
      load()
    } catch (err) { setError(err.message) }
  }

  const addSeats = async (e) => {
    e.preventDefault()
    setError('')
    const row_labels = parseRows(seatForm.rows)
    if (!row_labels.length) return setError('Enter at least one row, like A-E or A, B, C.')
    try {
      const v = await api.post(`/admin/venues/${seatForm.venue_id}/seats`, {
        row_labels, seats_per_row: Number(seatForm.seats_per_row), seat_type: seatForm.seat_type,
      })
      toast(`Seats added. ${v.venue_name} now has ${v.seat_count} seats.`)
      load()
    } catch (err) { setError(err.message) }
  }

  const setV = (k) => (e) => setVenueForm({ ...venueForm, [k]: e.target.value })
  const setS = (k) => (e) => setSeatForm({ ...seatForm, [k]: e.target.value })

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section>
        <ErrorNote>{error}</ErrorNote>
        {venues === null ? <Loading /> : (
          <div className="grid gap-4 sm:grid-cols-2">
            {venues.map((v) => (
              <div key={v.venue_id} className="panel p-5">
                <p className="font-display text-lg font-bold">{v.venue_name}</p>
                <p className="text-sm text-muted">{[v.street, v.city, v.state].filter(Boolean).join(', ')}</p>
                <p className="mt-3 text-sm">
                  {v.seat_count > 0 ? <><b>{v.seat_count}</b> seats</> : <span className="font-medium text-[#A9781B]">No seats yet. Events can't be created here until you add some.</span>}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="space-y-6">
        <form onSubmit={createVenue} className="panel space-y-4 p-5">
          <h2 className="font-display text-xl font-bold">Add a venue</h2>
          <Field label="Name"><input value={venueForm.venue_name} onChange={setV('venue_name')} required className="input" /></Field>
          <Field label="Street (optional)"><input value={venueForm.street} onChange={setV('street')} className="input" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="City"><input value={venueForm.city} onChange={setV('city')} required className="input" /></Field>
            <Field label="State"><input value={venueForm.state} onChange={setV('state')} required className="input" /></Field>
          </div>
          <button className="btn-primary w-full">Create venue</button>
        </form>

        <form onSubmit={addSeats} className="panel space-y-4 p-5">
          <h2 className="font-display text-xl font-bold">Add seats to a venue</h2>
          <Field label="Venue">
            <select value={seatForm.venue_id} onChange={setS('venue_id')} required className="input">
              <option value="">Choose a venue</option>
              {(venues || []).map((v) => <option key={v.venue_id} value={v.venue_id}>{v.venue_name}</option>)}
            </select>
          </Field>
          <Field label="Rows" hint="A range like A-E, or a list like A, B, VIP1.">
            <input value={seatForm.rows} onChange={setS('rows')} required className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Seats per row"><input type="number" min="1" max="100" value={seatForm.seats_per_row} onChange={setS('seats_per_row')} required className="input" /></Field>
            <Field label="Seat type"><input value={seatForm.seat_type} onChange={setS('seat_type')} required className="input" /></Field>
          </div>
          <button className="btn-ink w-full">Add seats</button>
        </form>
      </div>
    </div>
  )
}
