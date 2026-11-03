import { useEffect, useState } from 'react'
import { api } from '../api'
import { fmtDate, fmtTime, inr } from '../format'
import { Empty, ErrorNote, Field, Loading, useToast } from '../ui'

const blank = { venue_id: '', event_name: '', event_type: '', event_date: '', event_time: '19:00', base_price: '' }

function EventForm({ editing, venues, types, onDone, onCancel }) {
  const toast = useToast()
  const [form, setForm] = useState(
    editing
      ? { ...editing, event_time: editing.event_time.slice(0, 5), base_price: String(editing.base_price), event_type: editing.event_type || '' }
      : blank
  )
  const [seatTypes, setSeatTypes] = useState([])
  const [tierPrices, setTierPrices] = useState({})
  const [reprice, setReprice] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  // When a venue is picked, offer a price field for each seat type it has.
  useEffect(() => {
    if (editing || !form.venue_id) { setSeatTypes([]); return }
    api.get(`/admin/venues/${form.venue_id}/seat-types`).then((t) => { setSeatTypes(t); setTierPrices({}) }).catch(() => {})
  }, [form.venue_id, editing])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const common = {
        event_name: form.event_name, event_type: form.event_type || null,
        event_date: form.event_date, event_time: form.event_time.length === 5 ? form.event_time + ':00' : form.event_time,
        base_price: form.base_price,
      }
      if (editing) {
        await api.put(`/admin/events/${editing.event_id}`, { ...common, reprice_available: reprice })
        toast('Event updated.')
      } else {
        const price_by_seat_type = Object.fromEntries(Object.entries(tierPrices).filter(([, v]) => v !== ''))
        const ev = await api.post('/admin/events', { ...common, venue_id: Number(form.venue_id), price_by_seat_type })
        toast(`Event created with ${ev.seats_total} seats on sale.`)
      }
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="panel mb-6 p-5">
      <h2 className="mb-4 font-display text-xl font-bold">{editing ? `Edit ${editing.event_name}` : 'New event'}</h2>
      <ErrorNote>{error}</ErrorNote>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!editing && (
          <Field label="Venue">
            <select value={form.venue_id} onChange={set('venue_id')} required className="input">
              <option value="">Choose a venue</option>
              {venues.map((v) => <option key={v.venue_id} value={v.venue_id} disabled={!v.seat_count}>{v.venue_name}, {v.city}{v.seat_count ? ` (${v.seat_count} seats)` : ' (no seats)'}</option>)}
            </select>
          </Field>
        )}
        <Field label="Event name"><input value={form.event_name} onChange={set('event_name')} required className="input" /></Field>
        <Field label="Type" hint="Pick an existing type or type a new one.">
          <input list="event-types" value={form.event_type} onChange={set('event_type')} className="input" />
          <datalist id="event-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Date"><input type="date" value={form.event_date} onChange={set('event_date')} required className="input" /></Field>
        <Field label="Start time"><input type="time" value={form.event_time} onChange={set('event_time')} required className="input" /></Field>
        <Field label="Base price (₹)"><input type="number" min="1" step="0.01" value={form.base_price} onChange={set('base_price')} required className="input" /></Field>
      </div>

      {!editing && seatTypes.length > 0 && (
        <div className="mt-5 rounded-xl bg-paper p-4">
          <p className="text-sm font-semibold">Price by seat type</p>
          <p className="mb-3 text-xs text-muted">Leave blank to use the base price.</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {seatTypes.map((t) => (
              <Field key={t} label={t}>
                <input type="number" min="1" step="0.01" placeholder={form.base_price || 'Base price'} value={tierPrices[t] || ''}
                  onChange={(e) => setTierPrices({ ...tierPrices, [t]: e.target.value })} className="input" />
              </Field>
            ))}
          </div>
        </div>
      )}
      {editing && (
        <label className="mt-5 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={reprice} onChange={(e) => setReprice(e.target.checked)} className="h-4 w-4 accent-brand" />
          Also set the price of all unsold seats to the new base price
        </label>
      )}

      <div className="mt-6 flex gap-3">
        <button disabled={busy} className="btn-primary">{busy ? 'Saving…' : editing ? 'Save changes' : 'Create event'}</button>
        <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
      </div>
    </form>
  )
}

export default function EventsTab() {
  const toast = useToast()
  const [events, setEvents] = useState(null)
  const [venues, setVenues] = useState([])
  const [types, setTypes] = useState([])
  const [mode, setMode] = useState(null) // null | 'new' | event object
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')

  const load = () => {
    api.get('/admin/events').then(setEvents).catch((e) => { setError(e.message); setEvents([]) })
    api.get('/events/types').then(setTypes).catch(() => {})
  }
  useEffect(() => { load(); api.get('/venues').then(setVenues).catch(() => {}) }, [])

  const remove = async (ev) => {
    try {
      await api.del(`/admin/events/${ev.event_id}`)
      toast(`"${ev.event_name}" deleted.`)
      load()
    } catch (err) { toast(err.message, 'error') }
    setDeleting(null)
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{events ? `${events.length} events` : ''}</p>
        {!mode && <button onClick={() => setMode('new')} className="btn-primary">New event</button>}
      </div>
      <ErrorNote>{error}</ErrorNote>

      {mode && (
        <EventForm
          key={mode === 'new' ? 'new' : mode.event_id}
          editing={mode === 'new' ? null : mode} venues={venues} types={types}
          onCancel={() => setMode(null)} onDone={() => { setMode(null); load() }}
        />
      )}

      {events === null ? <Loading /> : events.length === 0 ? (
        <Empty title="No events yet">Create your first event to put seats on sale.</Empty>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>{['Event', 'When', 'Venue', 'Sold', 'Revenue', 'Base price', ''].map((h, i) => <th key={i} className="px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.map((ev) => (
                <tr key={ev.event_id} className="align-middle">
                  <td className="px-4 py-3"><p className="font-semibold">{ev.event_name}</p><p className="text-xs text-muted">{ev.event_type || 'No type'}</p></td>
                  <td className="whitespace-nowrap px-4 py-3">{fmtDate(ev.event_date)}<p className="text-xs text-muted">{fmtTime(ev.event_time)}</p></td>
                  <td className="px-4 py-3">{ev.venue?.venue_name}<p className="text-xs text-muted">{ev.venue?.city}</p></td>
                  <td className="px-4 py-3">{ev.tickets_sold} <span className="text-muted">/ {ev.seats_total}</span></td>
                  <td className="px-4 py-3 font-semibold">{inr(ev.revenue)}</td>
                  <td className="px-4 py-3">{inr(ev.base_price)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {deleting === ev.event_id ? (
                      <span className="inline-flex items-center gap-2">
                        <button onClick={() => setDeleting(null)} className="btn-ghost btn-sm">Keep</button>
                        <button onClick={() => remove(ev)} className="btn-danger btn-sm">Delete event</button>
                      </span>
                    ) : (
                      <span className="inline-flex gap-2">
                        <button onClick={() => { setMode(ev); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="btn-ghost btn-sm">Edit</button>
                        <button onClick={() => setDeleting(ev.event_id)} className="btn-ghost btn-sm text-rose">Delete</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
