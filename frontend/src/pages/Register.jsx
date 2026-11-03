import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api'
import { ErrorNote, Field } from '../ui'
import { AuthShell } from './Login'

const empty = {
  first_name: '', last_name: '', email: '', password: '',
  date_of_birth: '', address: '', phone_number: '',
}

export default function Register({ onLogin }) {
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const body = { ...form, address: form.address || null, phone_number: form.phone_number || null }
      const data = await api.post('/auth/register', body)
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      onLogin(data.user)
      navigate('/events')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="It takes a minute, and you can start booking straight away."
      footer={<>Already registered? <Link to="/login" className="font-semibold text-brand">Log in</Link></>}
    >
      <ErrorNote>{error}</ErrorNote>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><input value={form.first_name} onChange={update('first_name')} required className="input" /></Field>
          <Field label="Last name"><input value={form.last_name} onChange={update('last_name')} required className="input" /></Field>
        </div>
        <Field label="Email"><input type="email" autoComplete="email" value={form.email} onChange={update('email')} required className="input" /></Field>
        <Field label="Password" hint="At least 8 characters.">
          <input type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={update('password')} required className="input" />
        </Field>
        <Field label="Date of birth"><input type="date" value={form.date_of_birth} onChange={update('date_of_birth')} required className="input" /></Field>
        <Field label="Phone (optional)"><input value={form.phone_number} onChange={update('phone_number')} className="input" /></Field>
        <Field label="Address (optional)"><input value={form.address} onChange={update('address')} className="input" /></Field>
        <button disabled={busy} className="btn-primary w-full">{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthShell>
  )
}
