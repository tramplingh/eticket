"""Admin-only management endpoints: venues, seats, events, ticket check-in, platform-wide views."""
from datetime import date

from asyncmy.errors import IntegrityError
from fastapi import APIRouter, Depends, HTTPException

from app.database import DUPLICATE_KEY, error_code, execute, execute_many, fetch_all, fetch_one, get_db, transaction
from app.deps import require_admin
from app.queries import TICKET_SELECT, load_bookings, shape_event
from app.schemas import (
    AdminEventOut,
    AdminStats,
    BookingOut,
    CheckInRequest,
    CheckInResult,
    EventCreate,
    EventUpdate,
    SeatBlockCreate,
    VenueCreate,
    VenueOut,
)

SLOT_TAKEN = "This venue already has an event at that date and time"

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ---------- dashboard ----------

@router.get("/stats", response_model=AdminStats)
async def stats(db=Depends(get_db)):
    return await fetch_one(
        db,
        """
        SELECT
          (SELECT COUNT(*) FROM `user` WHERE role = 'user')                                AS users,
          (SELECT COUNT(*) FROM event)                                                     AS events,
          (SELECT COUNT(*) FROM booking WHERE booking_status = 'confirmed')                AS confirmed_bookings,
          (SELECT COUNT(*) FROM ticket WHERE ticket_status <> 'cancelled')                 AS tickets_sold,
          (SELECT COALESCE(SUM(ticket_price), 0) FROM ticket WHERE ticket_status <> 'cancelled') AS revenue
        """,
    )


@router.get("/bookings", response_model=list[BookingOut])
async def all_bookings(db=Depends(get_db)):
    return await load_bookings(db, "1 = 1", (), limit=200)


# ---------- venues & seats ----------

@router.post("/venues", response_model=VenueOut, status_code=201)
async def create_venue(payload: VenueCreate, db=Depends(get_db)):
    try:
        _, venue_id = await execute(
            db,
            "INSERT INTO venue (venue_name, street, city, state) VALUES (%s, %s, %s, %s)",
            (payload.venue_name, payload.street, payload.city, payload.state),
        )
    except IntegrityError as exc:
        if error_code(exc) == DUPLICATE_KEY:  # UNIQUE (venue_name, city)
            raise HTTPException(status_code=409, detail="A venue with this name already exists in this city")
        raise
    return {**payload.model_dump(), "venue_id": venue_id, "seat_count": 0}


@router.post("/venues/{venue_id}/seats", response_model=VenueOut, status_code=201)
async def add_seats(venue_id: int, payload: SeatBlockCreate, db=Depends(get_db)):
    venue = await fetch_one(db, "SELECT * FROM venue WHERE venue_id = %s", (venue_id,))
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")

    rows = [r.strip().upper() for r in payload.row_labels if r.strip()]
    if not rows or len(set(rows)) != len(rows):
        raise HTTPException(status_code=400, detail="Row labels must be non-empty and unique")

    async with transaction(db):
        existing = await fetch_all(
            db, "SELECT row_num, seat_number FROM seat WHERE venue_id = %s FOR UPDATE", (venue_id,)
        )
        taken = {(r["row_num"], r["seat_number"]) for r in existing}
        new_seats = [
            (venue_id, row, str(n), payload.seat_type)
            for row in rows
            for n in range(1, payload.seats_per_row + 1)
            if (row, str(n)) not in taken
        ]
        if not new_seats:
            raise HTTPException(status_code=409, detail="Those seats already exist in this venue")
        await execute_many(
            db, "INSERT INTO seat (venue_id, row_num, seat_number, seat_type) VALUES (%s, %s, %s, %s)", new_seats
        )

    return await fetch_one(
        db,
        """
        SELECT v.venue_id, v.venue_name, v.street, v.city, v.state, COUNT(s.seat_id) AS seat_count
        FROM venue v LEFT JOIN seat s ON s.venue_id = v.venue_id
        WHERE v.venue_id = %s GROUP BY v.venue_id, v.venue_name, v.street, v.city, v.state
        """,
        (venue_id,),
    )


@router.get("/venues/{venue_id}/seat-types", response_model=list[str])
async def venue_seat_types(venue_id: int, db=Depends(get_db)):
    rows = await fetch_all(
        db,
        "SELECT DISTINCT seat_type FROM seat WHERE venue_id = %s AND seat_type IS NOT NULL ORDER BY seat_type",
        (venue_id,),
    )
    return [r["seat_type"] for r in rows]


# ---------- events ----------

ADMIN_EVENT_SELECT = """
    SELECT e.event_id, e.venue_id, e.event_name, e.event_type, e.event_date, e.event_time, e.base_price,
           v.venue_name, v.street, v.city, v.state,
           (SELECT COUNT(*) FROM event_seat es WHERE es.event_id = e.event_id) AS seats_total,
           (SELECT COUNT(*) FROM event_seat es
             WHERE es.event_id = e.event_id AND es.availability_status = 'available') AS seats_available,
           COALESCE(sales.tickets_sold, 0) AS tickets_sold,
           COALESCE(sales.revenue, 0)      AS revenue
    FROM event e
    JOIN venue v ON v.venue_id = e.venue_id
    LEFT JOIN (
        SELECT es.event_id, COUNT(*) AS tickets_sold, SUM(t.ticket_price) AS revenue
        FROM ticket t
        JOIN event_seat es ON es.event_seat_id = t.event_seat_id
        WHERE t.ticket_status <> 'cancelled'
        GROUP BY es.event_id
    ) sales ON sales.event_id = e.event_id
"""


@router.get("/events", response_model=list[AdminEventOut])
async def admin_events(db=Depends(get_db)):
    rows = await fetch_all(db, f"{ADMIN_EVENT_SELECT} ORDER BY e.event_date DESC, e.event_time DESC")
    return [shape_event(r) for r in rows]


@router.post("/events", response_model=AdminEventOut, status_code=201)
async def create_event(payload: EventCreate, db=Depends(get_db)):
    if payload.event_date < date.today():
        raise HTTPException(status_code=400, detail="Event date can't be in the past")

    try:
        event_id = await _insert_event(db, payload)
    except IntegrityError as exc:
        if error_code(exc) == DUPLICATE_KEY:  # UNIQUE (venue_id, event_date, event_time)
            raise HTTPException(status_code=409, detail=SLOT_TAKEN)
        raise
    return shape_event(await fetch_one(db, f"{ADMIN_EVENT_SELECT} WHERE e.event_id = %s", (event_id,)))


async def _insert_event(db, payload: EventCreate) -> int:
    async with transaction(db):
        venue = await fetch_one(db, "SELECT venue_id FROM venue WHERE venue_id = %s", (payload.venue_id,))
        if not venue:
            raise HTTPException(status_code=404, detail="Venue not found")

        _, event_id = await execute(
            db,
            "INSERT INTO event (venue_id, event_name, event_type, event_date, event_time, base_price) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (payload.venue_id, payload.event_name, payload.event_type, payload.event_date,
             payload.event_time, payload.base_price),
        )

        # One inventory row per physical seat in the venue, all priced at the base price...
        created, _ = await execute(
            db,
            "INSERT INTO event_seat (event_id, seat_id, availability_status, price) "
            "SELECT %s, s.seat_id, 'available', %s FROM seat s WHERE s.venue_id = %s",
            (event_id, payload.base_price, payload.venue_id),
        )
        if created == 0:
            # Raising inside the transaction rolls the event insert back too.
            raise HTTPException(
                status_code=400, detail="This venue has no seats yet. Add seats to the venue first."
            )

        # ...then premium seat types get their own price.
        for seat_type, price in payload.price_by_seat_type.items():
            await execute(
                db,
                "UPDATE event_seat es JOIN seat s ON s.seat_id = es.seat_id "
                "SET es.price = %s WHERE es.event_id = %s AND s.seat_type = %s",
                (price, event_id, seat_type),
            )
    return event_id


@router.put("/events/{event_id}", response_model=AdminEventOut)
async def update_event(event_id: int, payload: EventUpdate, db=Depends(get_db)):
    changes = payload.model_dump(exclude_unset=True, exclude={"reprice_available"})
    try:
        await _apply_event_update(db, event_id, payload, changes)
    except IntegrityError as exc:
        if error_code(exc) == DUPLICATE_KEY:
            raise HTTPException(status_code=409, detail=SLOT_TAKEN)
        raise
    return shape_event(await fetch_one(db, f"{ADMIN_EVENT_SELECT} WHERE e.event_id = %s", (event_id,)))


async def _apply_event_update(db, event_id: int, payload: EventUpdate, changes: dict) -> None:
    async with transaction(db):
        if not await fetch_one(db, "SELECT event_id FROM event WHERE event_id = %s FOR UPDATE", (event_id,)):
            raise HTTPException(status_code=404, detail="Event not found")

        if changes:
            # Column names come from the Pydantic model's fixed field list, never from the client.
            assignments = ", ".join(f"{col} = %s" for col in changes)
            await execute(db, f"UPDATE event SET {assignments} WHERE event_id = %s", (*changes.values(), event_id))

        if payload.reprice_available and payload.base_price is not None:
            await execute(
                db,
                "UPDATE event_seat SET price = %s WHERE event_id = %s AND availability_status = 'available'",
                (payload.base_price, event_id),
            )


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(event_id: int, db=Depends(get_db)):
    async with transaction(db):
        if not await fetch_one(db, "SELECT event_id FROM event WHERE event_id = %s FOR UPDATE", (event_id,)):
            raise HTTPException(status_code=404, detail="Event not found")

        sold = await fetch_one(
            db,
            "SELECT COUNT(*) AS n FROM ticket t JOIN event_seat es ON es.event_seat_id = t.event_seat_id "
            "WHERE es.event_id = %s",
            (event_id,),
        )
        if sold["n"] > 0:
            raise HTTPException(
                status_code=409,
                detail="This event has booking history and can't be deleted. Only events with no bookings can be removed.",
            )
        await execute(db, "DELETE FROM event_seat WHERE event_id = %s", (event_id,))
        await execute(db, "DELETE FROM event WHERE event_id = %s", (event_id,))


# ---------- ticket check-in (gate) ----------

@router.post("/tickets/check-in", response_model=CheckInResult)
async def check_in(payload: CheckInRequest, db=Depends(get_db)):
    """Mark a ticket as used at the venue gate. Accepts the full QR value or the 8-character code
    printed under the QR. Only an active ticket for an event that has not passed can be admitted;
    trg_ticket_before_update independently refuses any other status change."""
    code = payload.code.strip().lower()
    async with transaction(db):
        # Prefix search on the unique qr_code index (a range scan, not a table scan).
        # The schema only allows hex digits and dashes, so the code cannot smuggle in % or _.
        matches = await fetch_all(
            db,
            f"{TICKET_SELECT} WHERE t.qr_code LIKE %s ORDER BY t.ticket_id LIMIT 2 FOR UPDATE OF t",
            (code + "%",),
        )
        if not matches:
            raise HTTPException(status_code=404, detail="No ticket matches that code")
        if len(matches) > 1:
            raise HTTPException(status_code=409, detail="That code matches more than one ticket. Enter the full code.")

        ticket = matches[0]
        seat = f"{ticket['row_num']}{ticket['seat_number']}, {ticket['event_name']}"
        if ticket["ticket_status"] == "used":
            raise HTTPException(status_code=409, detail=f"Already checked in: seat {seat}")
        if ticket["ticket_status"] == "cancelled":
            raise HTTPException(status_code=409, detail=f"This ticket was cancelled: seat {seat}")
        if ticket["event_date"] < date.today():
            raise HTTPException(status_code=400, detail=f"This ticket was for a past event: seat {seat}")

        await execute(db, "UPDATE ticket SET ticket_status = 'used' WHERE ticket_id = %s", (ticket["ticket_id"],))
        holder = await fetch_one(
            db,
            "SELECT b.booking_id, CONCAT(u.first_name, ' ', u.last_name) AS holder_name, u.email AS holder_email "
            "FROM booking b JOIN `user` u ON u.user_id = b.user_id WHERE b.booking_id = %s",
            (ticket["booking_id"],),
        )

    ticket["ticket_status"] = "used"
    return {"ticket": ticket, **holder}
