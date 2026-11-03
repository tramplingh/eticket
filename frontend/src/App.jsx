import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, Link, useNavigate } from 'react-router-dom'
import { api, getToken } from './api'
import { ToastProvider } from './ui'
import Login from './pages/Login'
import Register from './pages/Register'
import Events from './pages/Events'
import EventSeats from './pages/EventSeats'
import MyBookings from './pages/MyBookings'
import Profile from './pages/Profile'
import Admin from './pages/Admin'

function Logo() {
  return (
    <Link to="/events" className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#3D3DDB" />
        <path d="M7 11h18v3a2 2 0 0 0 0 4v3H7v-3a2 2 0 0 0 0-4z" fill="#FFB83D" />
      </svg>
      <span className="whitespace-nowrap font-display text-xl font-extrabold tracking-tight max-[420px]:sr-only">e-ticket</span>
    </Link>
  )
}

const navLink = ({ isActive }) =>
  `whitespace-nowrap rounded-lg px-2 py-1.5 text-sm font-medium transition-colors sm:px-3 ${isActive ? 'bg-brand-soft text-brand' : 'text-muted hover:text-ink'}`

function Navbar({ user, onLogout }) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-0.5 sm:gap-1">
          <NavLink to="/events" className={navLink}>Events</NavLink>
          {user && user.role !== 'admin' && <NavLink to="/my-bookings" className={navLink}>My bookings</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin" className={navLink}>Admin</NavLink>}
          <span className="mx-2 hidden h-5 w-px bg-line sm:block" />
          {user ? (
            <>
              <NavLink to="/profile" className={navLink} title="Your profile" aria-label="Your profile">
                <span className="inline-flex items-center gap-1.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
                  <span className="hidden sm:inline">{user.first_name}</span>
                </span>
              </NavLink>
              <button
                onClick={() => { onLogout(); navigate('/events') }}
                className="btn-ghost btn-sm ml-1 whitespace-nowrap"
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={navLink}>Log in</NavLink>
              <Link to="/register" className="btn-primary btn-sm ml-1">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

function RequireAuth({ children }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ user, children }) {
  if (!getToken()) return <Navigate to="/login" replace />
  if (user && user.role !== 'admin') return <Navigate to="/events" replace />
  return user ? children : null
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')) } catch { return null }
  })

  // Re-check the session on load so a changed role (or an expired token) is picked up.
  useEffect(() => {
    if (!getToken()) return
    api.get('/auth/me')
      .then((u) => { localStorage.setItem('user', JSON.stringify(u)); setUser(u) })
      .catch((e) => { if (e.status === 401) handleLogout() })
  }, [])

  const handleLogin = (u) => setUser(u)
  // Keep the cached user (and the name in the navbar) in step with profile edits.
  const handleUserChange = (p) => {
    const next = { ...user, first_name: p.first_name, last_name: p.last_name, address: p.address }
    localStorage.setItem('user', JSON.stringify(next))
    setUser(next)
  }
  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
  }

  return (
    <BrowserRouter>
      <ToastProvider>
        <Navbar user={user} onLogout={handleLogout} />
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6">
          <Routes>
            <Route path="/" element={<Navigate to="/events" replace />} />
            <Route path="/login" element={<Login onLogin={handleLogin} />} />
            <Route path="/register" element={<Register onLogin={handleLogin} />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:eventId" element={<EventSeats user={user} />} />
            <Route path="/my-bookings" element={<RequireAuth><MyBookings /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile onUserChange={handleUserChange} /></RequireAuth>} />
            <Route path="/admin" element={<RequireAdmin user={user}><Admin /></RequireAdmin>} />
            <Route path="/reports" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
      </ToastProvider>
    </BrowserRouter>
  )
}
