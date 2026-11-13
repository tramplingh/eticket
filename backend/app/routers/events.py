from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import fetch_all, fetch_one, get_db
from app.queries import EVENT_SELECT, shape_event
from app.schemas import EventOut, EventSeatOut

router = APIRouter(prefix="/events", tags=["events"])

# Time windows for the "When" filter, computed by MySQL's own date functions.
# These are fixed SQL fragments chosen by name; nothing typed by the user is pasted into SQL.
# Every fragment compares the bare column e.event_date, so the index idx_event_date is still used.
PERIODS = {
    "upcoming":   "e.event_date >= CURDATE()",
    "today":      "e.event_date = CURDATE()",
    "next_7":     "e.event_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 6 DAY",
    "next_30":    "e.event_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 29 DAY",
    "this_month": "e.event_date BETWEEN CURDATE() - INTERVAL (DAYOFMONTH(CURDATE()) - 1) DAY AND LAST_DAY(CURDATE())",
    "past_7":     "e.event_date BETWEEN CURDATE() - INTERVAL 7 DAY AND CURDATE() - INTERVAL 1 DAY",
    "past_30":    "e.event_date BETWEEN CURDATE() - INTERVAL 30 DAY AND CURDATE() - INTERVAL 1 DAY",
    "last_month": "e.event_date BETWEEN LAST_DAY(CURDATE() - INTERVAL 2 MONTH) + INTERVAL 1 DAY "
                  "AND LAST_DAY(CURDATE() - INTERVAL 1 MONTH)",
    "past":       "e.event_date < CURDATE()",
    "all":        None,
}
LOOKING_BACK = {"past_7", "past_30", "last_month", "past"}  # newest first for these

Period = Literal["upcoming", "today", "next_7", "next_30", "this_month", "past_7", "past_30", "last_month", "past", "all"]


def event_window(period: str, month: str | None, event_date: date | None,
                 date_from: date | None, date_to: date | None) -> tuple[list[str], list, bool]:
    """WHERE conditions (and their %s values) for a time window over e.event_date.

    An explicit month / day / range wins over the preset period. Also used by the admin Events tab.
    Returns (conditions, args, explicit).
    """
    conditions, args = [], []
    if month:
        first_day = date(int(month[:4]), int(month[5:]), 1)
        conditions.append("e.event_date BETWEEN %s AND LAST_DAY(%s)")
        args += [first_day, first_day]
    if event_date:
        conditions.append("e.event_date = %s")
        args.append(event_date)
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="The start date must be on or before the end date")
    if date_from:
        conditions.append("e.event_date >= %s")
        args.append(date_from)
    if date_to:
        conditions.append("e.event_date <= %s")
        args.append(date_to)
    explicit = bool(month or event_date or date_from or date_to)
    if not explicit and PERIODS[period]:
        conditions.append(PERIODS[period])
    return conditions, args, explicit


MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"


@router.get("", response_model=list[EventOut])
async def search_events(
    event_type: str | None = Query(None),
    venue_id: int | None = Query(None),
    q: str | None = Query(None, description="Search in the event name"),
    period: Period = Query("upcoming", description="Preset time window (ignored if a date, month or range is given)"),
    month: str | None = Query(None, pattern=MONTH_PATTERN, description="A calendar month, e.g. 2026-10"),
    event_date: date | None = Query(None, description="One specific day"),
    date_from: date | None = Query(None, description="Custom range start (inclusive)"),
    date_to: date | None = Query(None, description="Custom range end (inclusive)"),
    include_past: bool = Query(False, description="Old switch, same as period=all"),
    db=Depends(get_db),
):
    conditions, args, explicit = event_window("all" if include_past else period, month, event_date, date_from, date_to)

    # ---- what and where
    if event_type:
        conditions.append("e.event_type = %s")
        args.append(event_type)
    if venue_id:
        conditions.append("e.venue_id = %s")
        args.append(venue_id)
    if q:
        conditions.append("e.event_name LIKE %s")
        args.append(f"%{q}%")  # the wildcards travel inside the parameter, not the SQL text

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    order = "DESC" if not explicit and period in LOOKING_BACK else "ASC"
    rows = await fetch_all(db, f"{EVENT_SELECT} {where} ORDER BY e.event_date {order}, e.event_time {order}", args)
    return [shape_event(r) for r in rows]


# Declared before /{event_id} so "types" is not parsed as an id.
@router.get("/types", response_model=list[str])
async def event_types(db=Depends(get_db)):
    rows = await fetch_all(
        db, "SELECT DISTINCT event_type FROM event WHERE event_type IS NOT NULL ORDER BY event_type"
    )
    return [r["event_type"] for r in rows]


@router.get("/{event_id}", response_model=EventOut)
async def get_event(event_id: int, db=Depends(get_db)):
    row = await fetch_one(db, f"{EVENT_SELECT} WHERE e.event_id = %s", (event_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    return shape_event(row)


@router.get("/{event_id}/seats", response_model=list[EventSeatOut])
async def event_seats(event_id: int, db=Depends(get_db)):
    rows = await fetch_all(
        db,
        """
        SELECT es.event_seat_id, es.seat_id, es.availability_status, es.price,
               s.row_num, s.seat_number, s.seat_type
        FROM event_seat es
        JOIN seat s ON s.seat_id = es.seat_id
        WHERE es.event_id = %s
        ORDER BY s.row_num, CAST(s.seat_number AS UNSIGNED), s.seat_number
        """,
        (event_id,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="No seats found for this event")
    return [
        {
            "event_seat_id": r["event_seat_id"],
            "seat_id": r["seat_id"],
            "availability_status": r["availability_status"],
            "price": r["price"],
            "seat": {
                "seat_id": r["seat_id"],
                "row_num": r["row_num"],
                "seat_number": r["seat_number"],
                "seat_type": r["seat_type"],
            },
        }
        for r in rows
    ]
