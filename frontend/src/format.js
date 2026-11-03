export const inr = (n) =>
  "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })

// Dates arrive as "YYYY-MM-DD"; build them in local time so they never shift a day.
export const parseDate = (d) => {
  const [y, m, day] = d.split("-").map(Number)
  return new Date(y, m - 1, day)
}
export const fmtDate = (d) =>
  parseDate(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
export const monthShort = (d) => parseDate(d).toLocaleDateString("en-IN", { month: "short" })
export const dayNum = (d) => parseDate(d).getDate()
export const weekday = (d) => parseDate(d).toLocaleDateString("en-IN", { weekday: "short" })

export const fmtTime = (t) => {
  const [h, m] = t.split(":").map(Number)
  const ap = h >= 12 ? "pm" : "am"
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`
}
export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })

// Today as "YYYY-MM-DD" in local time, comparable with API dates as plain strings.
export const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
export const isPast = (d) => d < todayISO()
