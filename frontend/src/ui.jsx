import { createContext, useCallback, useContext, useState } from 'react'

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const show = useCallback((message, tone = 'ok') => {
    setToast({ message, tone, id: Date.now() })
    setTimeout(() => setToast((t) => (t && Date.now() - t.id >= 3400 ? null : t)), 3500)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div role="status" className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className={`toast-in rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${toast.tone === 'error' ? 'bg-rose text-white' : 'bg-ink text-white'}`}>
            {toast.message}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  )
}

const pillTones = {
  confirmed: 'bg-mint-soft text-mint',
  active: 'bg-mint-soft text-mint',
  completed: 'bg-mint-soft text-mint',
  available: 'bg-mint-soft text-mint',
  pending: 'bg-saffron-soft text-[#A9781B]',
  locked: 'bg-saffron-soft text-[#A9781B]',
  cancelled: 'bg-line text-muted',
  refunded: 'bg-brand-soft text-brand',
  'partially refunded': 'bg-brand-soft text-brand',
  'checked in': 'bg-ink text-white',
  used: 'bg-line text-muted',
  failed: 'bg-rose-soft text-rose',
  admin: 'bg-ink text-white',
}
export function Pill({ children, tone }) {
  const cls = pillTones[tone ?? children] || 'bg-line text-muted'
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export function ErrorNote({ children }) {
  if (!children) return null
  return <p role="alert" className="mb-4 rounded-lg bg-rose-soft px-3 py-2 text-sm text-rose">{children}</p>
}

export function Empty({ title, children }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <p className="font-display text-lg font-bold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{children}</p>}
    </div>
  )
}

export function Loading({ label = 'Loading' }) {
  return <p className="py-16 text-center text-sm text-muted">{label}…</p>
}
