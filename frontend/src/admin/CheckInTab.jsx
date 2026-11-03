import { useRef, useState } from 'react'
import { api } from '../api'
import Ticket from '../components/Ticket'
import { Field } from '../ui'

/** Gate check-in: type the 8-character code printed under a ticket's QR (or paste the full code). */
export default function CheckInTab() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)   // { ok: true, data } | { ok: false, message }
  const [log, setLog] = useState([])
  const input = useRef(null)

  const submit = async (e) => {
    e.preventDefault()
    const value = code.trim().replace(/^#/, '')
    if (!value) return
    setBusy(true)
    try {
      const data = await api.post('/admin/tickets/check-in', { code: value })
      setResult({ ok: true, data })
      setLog((l) => [{ ok: true, code: value, text: `${data.ticket.row_num}${data.ticket.seat_number} · ${data.holder_name}`, at: new Date() }, ...l].slice(0, 8))
    } catch (err) {
      const message = err.status === 422 ? 'Codes are 8 or more letters a-f and digits, like 3f9a1c2e.' : err.message
      setResult({ ok: false, message })
      setLog((l) => [{ ok: false, code: value, text: message, at: new Date() }, ...l].slice(0, 8))
    } finally {
      setBusy(false)
      setCode('')
      input.current?.focus()
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <form onSubmit={submit} className="panel p-5">
          <h2 className="font-display text-xl font-bold">Check in a ticket</h2>
          <p className="mb-4 text-sm text-muted">Enter the code printed under the ticket's QR. A ticket can only be admitted once.</p>
          <Field label="Ticket code">
            <div className="flex gap-2">
              <input
                ref={input} value={code} onChange={(e) => setCode(e.target.value)} autoFocus required
                placeholder="e.g. 3f9a1c2e" autoComplete="off" spellCheck={false}
                className="input font-mono text-base tracking-wider"
              />
              <button disabled={busy} className="btn-primary shrink-0 px-6">{busy ? 'Checking…' : 'Check in'}</button>
            </div>
          </Field>
        </form>

        {result && (result.ok ? (
          <div role="status" className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-mint-soft px-4 py-3 text-mint">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              <p className="font-semibold">
                Admit {result.data.holder_name}: seat {result.data.ticket.row_num}{result.data.ticket.seat_number}
                <span className="font-normal"> · booking #{result.data.booking_id}</span>
              </p>
            </div>
            <Ticket t={result.data.ticket} />
          </div>
        ) : (
          <div role="alert" className="flex items-center gap-3 rounded-xl bg-rose-soft px-4 py-3 text-rose">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            <p className="font-semibold">Do not admit. {result.message}</p>
          </div>
        ))}
      </div>

      <aside className="panel self-start p-5">
        <h3 className="font-display text-lg font-bold">This session</h3>
        {log.length === 0 ? <p className="mt-1 text-sm text-muted">Scans you make appear here.</p> : (
          <ul className="mt-3 space-y-2.5">
            {log.map((x, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${x.ok ? 'bg-mint' : 'bg-rose'}`} aria-hidden />
                <span className="min-w-0">
                  <span className="font-mono text-xs text-muted">{x.code.slice(0, 8)}</span>{' '}
                  <span className={x.ok ? '' : 'text-rose'}>{x.text}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}
