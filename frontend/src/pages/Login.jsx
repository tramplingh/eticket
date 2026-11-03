import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { api } from '../api'
import { ErrorNote, Field } from '../ui'

export function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="mx-auto mt-6 max-w-md sm:mt-12">
      <h1 className="font-display text-4xl font-extrabold">{title}</h1>
      <p className="mt-2 text-muted">{subtitle}</p>
      <div className="panel mt-6 p-6">{children}</div>
      <p className="mt-4 text-center text-sm text-muted">{footer}</p>
    </div>
  )
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const from = useLocation().state?.from

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const data = await api.post('/auth/login', { email, password })
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('user', JSON.stringify(data.user))
      onLogin(data.user)
      navigate(from || (data.user.role === 'admin' ? '/admin' : '/events'))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to see your tickets and book seats."
      footer={<>New here? <Link to="/register" className="font-semibold text-brand">Create an account</Link></>}
    >
      <ErrorNote>{error}</ErrorNote>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email">
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="input" />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="input" />
        </Field>
        <button disabled={busy} className="btn-primary w-full">{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </AuthShell>
  )
}
