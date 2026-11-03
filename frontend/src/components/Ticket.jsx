import { QRCodeSVG } from 'qrcode.react'
import { fmtDate, fmtTime, inr } from '../format'
import { Pill } from '../ui'

/** One issued ticket: event details on the left, scannable code on the tear-off stub.
 *  `action` is an optional control (e.g. a cancel button) shown under the seat line. */
export default function Ticket({ t, action }) {
  const cancelled = t.ticket_status === 'cancelled'
  const used = t.ticket_status === 'used'
  return (
    <div className="ticket-wrap">
      <div className={`ticket flex ${cancelled ? 'opacity-55' : ''}`} style={{ '--stub': '124px' }}>
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-lg font-bold leading-tight">{t.event_name}</p>
            {cancelled && <Pill>cancelled</Pill>}
            {used && <Pill>checked in</Pill>}
          </div>
          <p className="mt-1 text-sm text-muted">
            {t.event_date && fmtDate(t.event_date)} at {t.event_time && fmtTime(t.event_time)}
          </p>
          <p className="text-sm text-muted">{t.venue_name}, {t.city}</p>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <p className={`font-display text-2xl font-extrabold ${cancelled ? 'text-muted line-through decoration-2' : 'text-brand'}`}>
              {t.row_num}{t.seat_number}
            </p>
            <p className="text-sm text-muted">
              Row {t.row_num}, seat {t.seat_number}{t.seat_type ? ` · ${t.seat_type}` : ''}
            </p>
            <p className="ml-auto text-sm font-semibold">{inr(t.ticket_price)}</p>
          </div>
          {action && <div className="mt-3 border-t border-dashed border-line pt-3">{action}</div>}
        </div>
        <div className="perforation my-3 w-0.5 shrink-0 self-stretch" aria-hidden />
        <div className="flex w-[124px] shrink-0 flex-col items-center justify-center gap-1.5 p-3">
          <QRCodeSVG value={t.qr_code || String(t.ticket_id)} size={84} fgColor={cancelled ? '#A5A9C4' : '#171A3A'} level="M" />
          <p className="font-mono text-[10px] text-muted">#{String(t.qr_code || t.ticket_id).slice(0, 8)}</p>
        </div>
      </div>
    </div>
  )
}
