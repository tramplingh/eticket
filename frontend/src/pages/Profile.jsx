import { useEffect, useState } from 'react'
import { api } from '../api'
import { fmtDate, fmtDateTime } from '../format'
import { ErrorNote, Field, Loading, Pill, useToast } from '../ui'

const MAX_PHONES = 5

function Detail({ label, note, children }) {
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-0.5 font-medium [overflow-wrap:anywhere]">{children}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  )
}

export default function Profile({ onUserChange }) {
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ first_name: '', last_name: '', address: '' })
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [saving, setSaving] = useState(false)

  const apply = (p) => {
    setProfile(p)
    setForm({ first_name: p.first_name, last_name: p.last_name, address: p.address || '' })
  }

  useEffect(() => {
    api.get('/users/me').then(apply).catch((e) => setError(e.message))
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const p = await api.put('/users/me', form)
      apply(p)
      onUserChange?.(p)
      toast('Profile saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const addPhone = async (e) => {
    e.preventDefault()
    setPhoneError('')
    try {
      apply(await api.post('/users/me/phones', { phone_number: phone.trim() }))
      setPhone('')
      toast('Phone number added.')
    } catch (err) {
      setPhoneError(err.status === 422 ? 'Enter digits only, optionally starting with + (spaces and dashes are fine).' : err.message)
    }
  }

  const removePhone = async (n) => {
    try {
      apply(await api.del(`/users/me/phones/${encodeURIComponent(n)}`))
      toast('Phone number removed.')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (!profile) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />

  const dirty = form.first_name !== profile.first_name || form.last_name !== profile.last_name
    || form.address !== (profile.address || '')
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold">{profile.full_name}</h1>
          <p className="mt-1 text-muted">Member since {fmtDateTime(profile.created_at)}</p>
        </div>
        {profile.role === 'admin' && <Pill>admin</Pill>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <form onSubmit={save} className="panel p-5 sm:p-6">
          <h2 className="font-display text-xl font-bold">Your details</h2>
          <div className="mb-5 mt-4 grid gap-4 rounded-xl bg-paper p-4 sm:grid-cols-[1.6fr_1fr_0.8fr]">
            <Detail label="Email">{profile.email}</Detail>
            <Detail label="Date of birth">{fmtDate(profile.date_of_birth)}</Detail>
            <Detail label="Age" note="From date of birth">{profile.age} years</Detail>
          </div>
          <ErrorNote>{error}</ErrorNote>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name"><input value={form.first_name} onChange={set('first_name')} required maxLength={50} className="input" /></Field>
            <Field label="Last name"><input value={form.last_name} onChange={set('last_name')} required maxLength={50} className="input" /></Field>
          </div>
          <div className="mt-4">
            <Field label="Address (optional)"><input value={form.address} onChange={set('address')} maxLength={255} className="input" /></Field>
          </div>
          <button disabled={!dirty || saving} className="btn-primary mt-6">{saving ? 'Saving…' : 'Save changes'}</button>
        </form>

        <section className="panel p-5 sm:p-6" aria-labelledby="phones-h">
          <h2 id="phones-h" className="font-display text-xl font-bold">Phone numbers</h2>
          <p className="text-sm text-muted">Keep up to {MAX_PHONES}. Any of them can be used to reach you about a booking.</p>

          {profile.phones.length === 0 ? (
            <p className="my-5 rounded-lg border border-dashed border-line px-3 py-4 text-center text-sm text-muted">No phone numbers yet.</p>
          ) : (
            <ul className="my-4 divide-y divide-line">
              {profile.phones.map((n) => (
                <li key={n} className="flex items-center justify-between py-2.5">
                  <span className="font-medium tabular-nums">{n}</span>
                  <button onClick={() => removePhone(n)} className="text-sm font-semibold text-rose hover:underline" aria-label={`Remove ${n}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}

          {profile.phones.length < MAX_PHONES && (
            <form onSubmit={addPhone}>
              <ErrorNote>{phoneError}</ErrorNote>
              <Field label="Add a number">
                <div className="flex gap-2">
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="+91 98450 12345"
                    inputMode="tel" maxLength={20} className="input" />
                  <button className="btn-ink shrink-0">Add</button>
                </div>
              </Field>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
