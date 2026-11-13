import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { api } from '../api'
import logo from '../assets/uvce-logo.jpg'
import { dbFacts, guide, project, team } from '../team'

/** Counts read live from the API, so the title page also shows the database is up. */
function LiveStats() {
  const [stats, setStats] = useState(null) // null = loading, false = backend unreachable

  useEffect(() => {
    Promise.all([api.get('/events'), api.get('/venues')])
      .then(([events, venues]) => setStats({
        events: events.length,
        venues: venues.length,
        seats: venues.reduce((n, v) => n + (v.seat_count || 0), 0),
        onSale: events.reduce((n, e) => n + (e.seats_available || 0), 0),
      }))
      .catch(() => setStats(false))
  }, [])

  if (stats === null) return <div className="h-[104px]" aria-hidden />
  if (stats === false) {
    return (
      <p role="status" className="rounded-xl border border-dashed border-line px-5 py-4 text-sm text-muted">
        The backend isn't reachable. Start it with <code className="font-mono text-ink">uvicorn app.main:app</code> before entering.
      </p>
    )
  }

  const items = [
    ['Upcoming events', stats.events],
    ['Venues', stats.venues],
    ['Seats', stats.seats],
    ['Seats on sale now', stats.onSale],
  ]
  return (
    <section aria-label="Live database figures" className="panel landing-rise landing-rise-3 p-5 sm:p-6">
      <p className="mb-4 flex items-center gap-2 text-sm font-medium text-muted">
        <span className="live-dot inline-block h-2 w-2 rounded-full bg-mint" aria-hidden />
        Live from the MySQL database
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="font-display text-3xl font-extrabold tabular-nums">{value.toLocaleString('en-IN')}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default function Landing({ user }) {
  const second = user
    ? user.role === 'admin'
      ? { to: '/admin', label: 'Admin dashboard' }
      : { to: '/my-bookings', label: 'My bookings' }
    : { to: '/login', label: 'Log in' }

  return (
    <div className="min-h-screen bg-paper">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header className="flex items-center gap-4 border-b border-line py-5">
          <img src={logo} alt="University of Visvesvaraya College of Engineering logo" className="h-14 w-auto mix-blend-multiply sm:h-16" />
          <div className="min-w-0">
            <p className="font-display text-base font-bold leading-tight sm:text-lg">{project.college}</p>
            <p className="text-sm text-muted">{project.department} · {project.place}</p>
          </div>
        </header>

        <main className="grid gap-10 py-12 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-14 lg:py-20">
          <div className="landing-rise">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-3.5 py-1.5 text-sm font-semibold text-brand">
              {project.kind} · {project.year}
            </span>
            <h1 className="mt-5 font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              <span className="text-brand">E-Ticket</span>
              <br />
              Booking Platform
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted">{project.tagline}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/events" className="btn-primary px-6 py-3 text-base">
                Enter the platform
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
              <Link to={second.to} className="btn-ghost px-6 py-3 text-base">{second.label}</Link>
            </div>

            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Database layer">
              {dbFacts.map((f) => (
                <li key={f.label} className="rounded-full border border-line bg-white px-3 py-1 text-sm">
                  <b className="font-display">{f.n}</b> <span className="text-muted">{f.label}</span>
                </li>
              ))}
              <li className="rounded-full border border-line bg-white px-3 py-1 text-sm text-muted">MySQL 8 · FastAPI · React</li>
            </ul>
          </div>

          <div className="ticket-wrap landing-rise landing-rise-2" style={{ height: 'auto' }}>
            <div className="ticket landing-ticket flex" style={{ height: 'auto' }}>
              <div className="min-w-0 flex-1 p-5 sm:p-8">
                <p className="text-sm font-semibold text-brand">Presented by</p>
                <ul className="mt-4 space-y-4">
                  {team.map((m, i) => (
                    <li key={m.usn || m.name} className="flex items-baseline gap-3">
                      <span className="w-6 shrink-0 font-display text-sm font-bold text-muted">0{i + 1}</span>
                      <div className="min-w-0">
                        <p className="font-display text-xl font-bold leading-tight sm:text-2xl">{m.name}</p>
                        {m.usn && <p className="mt-0.5 font-mono text-sm text-muted">{m.usn}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 pl-9 text-sm text-muted">{project.className}</p>

                <div className="mt-6 border-t border-dashed border-line pt-5">
                  <p className="text-sm font-semibold text-brand">Under the guidance of</p>
                  <p className="mt-1 font-display text-base font-bold leading-snug sm:text-lg">{guide.name}</p>
                  <p className="text-sm text-muted">{guide.role}</p>
                </div>
              </div>

              <div className="perforation my-4 w-0.5 shrink-0 self-stretch" aria-hidden />

              <div className="flex w-[110px] shrink-0 flex-col items-center justify-center gap-3 bg-brand p-3 text-center text-white sm:w-[170px] sm:p-5">
                <div className="w-full max-w-[124px] rounded-lg bg-white p-2">
                  <QRCodeSVG
                    value={`${project.title} | ${project.kind} | UVCE | ${team.map((t) => t.name).join(', ')}`}
                    size={120} fgColor="#171A3A" level="M" style={{ width: '100%', height: 'auto', display: 'block' }}
                    aria-label="QR code with the project title and team"
                  />
                </div>
                <div>
                  <p className="font-display text-sm font-bold leading-tight sm:text-base">DBMS Lab</p>
                  <p className="mt-0.5 text-xs text-white/75">{project.session}</p>
                </div>
              </div>
            </div>
          </div>
        </main>

        <LiveStats />

        <footer className="mt-12 flex flex-wrap justify-between gap-2 border-t border-line py-6 text-sm text-muted">
          <span>{project.title} · {project.kind}</span>
          <span>{project.department}, UVCE</span>
        </footer>
      </div>
    </div>
  )
}
