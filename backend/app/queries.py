"""Shared read queries used by more than one router."""
from datetime import date
from typing import Literal

from fastapi import HTTPException

from app.database import fetch_all, placeholders

EVENT_SELECT = """
    SELECT e.event_id, e.venue_id, e.event_name, e.event_type, e.event_date, e.event_time, e.base_price,
           v.venue_name, v.street, v.city, v.state,
           (SELECT COUNT(*) FROM event_seat es WHERE es.event_id = e.event_id) AS seats_total,
           (SELECT COUNT(*) FROM event_seat es
             WHERE es.event_id = e.event_id AND es.availability_status = 'available') AS seats_available
    FROM event e
    JOIN venue v ON v.venue_id = e.venue_id
"""


# A ticket with the event, venue and seat it is for (5-table join).
TICKET_SELECT = """
    SELECT t.ticket_id, t.booking_id, t.event_seat_id, t.ticket_price, t.ticket_status, t.qr_code,
           e.event_id, e.event_name, e.event_date, e.event_time,
           v.venue_name, v.city,
           s.row_num, s.seat_number, s.seat_type
    FROM ticket t
    JOIN event_seat es ON es.event_seat_id = t.event_seat_id
    JOIN event e       ON e.event_id = es.event_id
    JOIN venue v       ON v.venue_id = e.venue_id
    JOIN seat s        ON s.seat_id = es.seat_id
"""


def shape_event(row: dict) -> dict:
    """Nest the joined venue columns under a 'venue' key."""
    row = dict(row)
    row["venue"] = {
        "venue_id": row["venue_id"],
        "venue_name": row.pop("venue_name"),
        "street": row.pop("street"),
        "city": row.pop("city"),
        "state": row.pop("state"),
    }
    return row


async def load_bookings(conn, where_sql: str, args: tuple = (), limit: int | None = None) -> list[dict]:
    """Fetch bookings (plus their tickets and payment) matching a WHERE clause.

    `where_sql` is written by the calling code, never by the client - all client
    values arrive through `args` as %s parameters.
    Three queries total (bookings, tickets, payments) instead of one per booking.
    """
    sql = f"""
        SELECT b.booking_id, b.booking_date, b.booking_status, b.total_amount,
               CONCAT(u.first_name, ' ', u.last_name) AS user_name, u.email AS user_email
        FROM booking b
        JOIN `user` u ON u.user_id = b.user_id
        WHERE {where_sql}
        ORDER BY b.booking_date DESC, b.booking_id DESC
    """
    if limit:
        sql += f" LIMIT {int(limit)}"
    bookings = await fetch_all(conn, sql, args)
    if not bookings:
        return []

    ids = [b["booking_id"] for b in bookings]
    ph = placeholders(len(ids))

    tickets = await fetch_all(conn, f"{TICKET_SELECT} WHERE t.booking_id IN ({ph}) ORDER BY t.ticket_id", ids)
    # refunded_amount is derived, not stored: what was charged minus what is still live.
    payments = await fetch_all(
        conn,
        f"""
        SELECT p.payment_id, p.booking_id, p.amount, (p.amount - b.total_amount) AS refunded_amount,
               p.payment_method, p.payment_status, p.payment_date, p.transaction_id
        FROM payment p
        JOIN booking b ON b.booking_id = p.booking_id
        WHERE p.booking_id IN ({ph})
        """,
        ids,
    )

    tickets_by_booking: dict[int, list] = {}
    for t in tickets:
        tickets_by_booking.setdefault(t["booking_id"], []).append(t)
    payment_by_booking = {p["booking_id"]: p for p in payments}

    for b in bookings:
        b["tickets"] = tickets_by_booking.get(b["booking_id"], [])
        b["payment"] = payment_by_booking.get(b["booking_id"])
    return bookings


# ---------- time windows over the date a booking was made ----------
# b.booking_date is a DATETIME, so each window is a half-open range [start, end): a booking at
# 23:59 on the last day still counts, and the bare column is compared, so idx_booking_date is used.
# Bookings are never in the future, so "last 7 days" means today and the six days before it.
BOOKING_PERIODS = {
    "all":        None,
    "today":      "b.booking_date >= CURDATE()",
    "past_7":     "b.booking_date >= CURDATE() - INTERVAL 6 DAY",
    "past_30":    "b.booking_date >= CURDATE() - INTERVAL 29 DAY",
    "this_month": "b.booking_date >= CURDATE() - INTERVAL (DAYOFMONTH(CURDATE()) - 1) DAY",
    "last_month": "b.booking_date >= LAST_DAY(CURDATE() - INTERVAL 2 MONTH) + INTERVAL 1 DAY "
                  "AND b.booking_date < CURDATE() - INTERVAL (DAYOFMONTH(CURDATE()) - 1) DAY",
}
BookingPeriod = Literal["all", "today", "past_7", "past_30", "this_month", "last_month"]


def booking_window(period: str, month: str | None, booking_date: date | None,
                   date_from: date | None, date_to: date | None) -> tuple[list[str], list]:
    """WHERE conditions (and their %s values) for a time window over b.booking_date.

    An explicit month / day / range wins over the preset period. Fragments are fixed SQL chosen
    by name; client values only ever travel as %s parameters.
    """
    conditions, args = [], []
    if month:
        first_day = date(int(month[:4]), int(month[5:]), 1)
        conditions.append("b.booking_date >= %s AND b.booking_date < DATE_ADD(LAST_DAY(%s), INTERVAL 1 DAY)")
        args += [first_day, first_day]
    if booking_date:
        conditions.append("b.booking_date >= %s AND b.booking_date < DATE_ADD(%s, INTERVAL 1 DAY)")
        args += [booking_date, booking_date]
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="The start date must be on or before the end date")
    if date_from:
        conditions.append("b.booking_date >= %s")
        args.append(date_from)
    if date_to:
        conditions.append("b.booking_date < DATE_ADD(%s, INTERVAL 1 DAY)")
        args.append(date_to)
    if not (month or booking_date or date_from or date_to) and BOOKING_PERIODS[period]:
        conditions.append(BOOKING_PERIODS[period])
    return conditions, args
