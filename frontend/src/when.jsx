// The "When" filter, shared by the Events page and the admin dashboard.
//
// The presets are computed by MySQL on the server (PERIODS in backend/app/routers/events.py for
// event dates, BOOKING_PERIODS in backend/app/routers/admin.py for booking dates). The date
// ranges below are only used to tell the person which dates a preset covers.

export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const dayOffset = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d) }
const monthRange = (y, m) => [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))] // m is 0-based; day 0 = last day of previous month
const now = new Date()
const thisMonth = () => monthRange(now.getFullYear(), now.getMonth())
const lastMonth = () => monthRange(now.getFullYear(), now.getMonth() - 1)

const CHOOSE_YOUR_OWN = [
  ['month', 'A specific month…'],
  ['date', 'A specific date…'],
  ['range', 'Custom range…'],
]

/** Windows over an event's date: events can be in the future or the past. */
export const EVENT_PERIOD_GROUPS = [
  ['Coming up', [
    ['upcoming', 'Upcoming', () => [dayOffset(0), null]],
    ['today', 'Today', () => [dayOffset(0), dayOffset(0)]],
    ['next_7', 'Next 7 days', () => [dayOffset(0), dayOffset(6)]],
    ['next_30', 'Next 30 days', () => [dayOffset(0), dayOffset(29)]],
    ['this_month', 'This month', thisMonth],
  ]],
  ['Already happened', [
    ['past_7', 'Past 7 days', () => [dayOffset(-7), dayOffset(-1)]],
    ['past_30', 'Past 30 days', () => [dayOffset(-30), dayOffset(-1)]],
    ['last_month', 'Last month', lastMonth],
    ['past', 'All past events', () => [null, dayOffset(-1)]],
  ]],
  ['Choose your own', [...CHOOSE_YOUR_OWN, ['all', 'Any date', () => [null, null]]]],
]

/** Windows over the date a booking was made: always today or earlier, so "last 7 days" includes today. */
export const BOOKING_PERIOD_GROUPS = [
  ['Booked', [
    ['all', 'All time', () => [null, null]],
    ['today', 'Today', () => [dayOffset(0), dayOffset(0)]],
    ['past_7', 'Last 7 days', () => [dayOffset(-6), dayOffset(0)]],
    ['past_30', 'Last 30 days', () => [dayOffset(-29), dayOffset(0)]],
    ['this_month', 'This month', thisMonth],
    ['last_month', 'Last month', lastMonth],
  ]],
  ['Choose your own', CHOOSE_YOUR_OWN],
]

const lookup = (groups) => Object.fromEntries(groups.flatMap(([, items]) => items.map(([id, label, range]) => [id, { label, range }])))

// The 12 months before and after this one, for the month picker.
const MONTHS = Array.from({ length: 25 }, (_, i) => {
  const d = new Date(now.getFullYear(), now.getMonth() - 12 + i, 1)
  return { value: iso(d).slice(0, 7), label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) }
}).reverse()

/** Starting values for the when-fields of a filter object. */
export const defaultWhen = (period, rangeDays = 30) => ({
  period, month: iso(now).slice(0, 7), date: dayOffset(0),
  date_from: rangeDays > 0 ? dayOffset(0) : dayOffset(rangeDays), date_to: rangeDays > 0 ? dayOffset(rangeDays) : dayOffset(0),
})

const fmtDay = (d) => {
  const x = new Date(d + 'T00:00:00')
  const part = (o) => x.toLocaleDateString('en-IN', o)
  return `${part({ weekday: 'short' })} ${x.getDate()} ${part({ month: 'short' })} ${x.getFullYear()}`
}

/**
 * Adds the when-fields of `f` to `params` (a URLSearchParams).
 * `dateParam` is the API's name for "one specific day" (event_date or booking_date).
 * Returns the preset's label and a sentence fragment naming the exact dates, e.g. "from Thu 29 Oct 2026 to Wed 4 Nov 2026".
 */
export function applyWhen(groups, f, params, dateParam) {
  const periods = lookup(groups)
  let from = null, to = null
  if (f.period === 'month') {
    params.set('month', f.month)
    const [y, m] = f.month.split('-').map(Number)
    ;[from, to] = monthRange(y, m - 1)
  } else if (f.period === 'date') {
    params.set(dateParam, f.date)
    from = to = f.date
  } else if (f.period === 'range') {
    if (f.date_from) params.set('date_from', f.date_from)
    if (f.date_to) params.set('date_to', f.date_to)
    from = f.date_from || null
    to = f.date_to || null
  } else {
    params.set('period', f.period)
    ;[from, to] = periods[f.period].range()
  }
  const window =
    from && to ? (from === to ? `on ${fmtDay(from)}` : `from ${fmtDay(from)} to ${fmtDay(to)}`)
    : from ? `from ${fmtDay(from)} onwards`
    : to ? `up to ${fmtDay(to)}`
    : 'on any date'
  return { label: periods[f.period].label.replace('…', ''), window }
}

/** The When menu plus the month, date or range inputs it opens. `value` is the whole filter object. */
export function WhenFilter({ groups, value, onChange, label = 'When' }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value })
  return (
    <>
      <select value={value.period} onChange={set('period')} aria-label={label} className="input w-auto">
        {groups.map(([group, items]) => (
          <optgroup key={group} label={group}>
            {items.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </optgroup>
        ))}
      </select>
      {value.period === 'month' && (
        <select value={value.month} onChange={set('month')} aria-label="Month" className="input w-auto">
          {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      )}
      {value.period === 'date' && (
        <input type="date" value={value.date} onChange={set('date')} aria-label="Date" required className="input w-auto" />
      )}
      {value.period === 'range' && (
        <span className="flex flex-wrap items-center gap-2">
          <input type="date" value={value.date_from} onChange={set('date_from')} aria-label="From date" className="input w-auto" />
          <span className="text-sm text-muted">to</span>
          <input type="date" value={value.date_to} onChange={set('date_to')} aria-label="To date" min={value.date_from || undefined} className="input w-auto" />
        </span>
      )}
    </>
  )
}
