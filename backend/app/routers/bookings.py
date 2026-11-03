import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException

from app.database import execute, execute_many, fetch_all, fetch_one, get_db, placeholders, transaction
from app.deps import get_current_user
from app.queries import load_bookings
from app.schemas import BookingCreate, BookingOut

router = APIRouter(prefix="/bookings", tags=["bookings"])


@router.post("", response_model=BookingOut, status_code=201)
async def create_booking(payload: BookingCreate, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    seat_ids = sorted(set(payload.event_seat_ids))
    ph = placeholders(len(seat_ids))

    # One atomic unit: seat check + booking + tickets + payment all commit together or not at all.
    async with transaction(db):
        # FOR UPDATE takes row locks, so a second buyer of the same seat waits here and then
        # sees it as 'booked'. Sorting the ids keeps lock order consistent (avoids deadlocks).
        seats = await fetch_all(
            db,
            f"SELECT event_seat_id, availability_status, price FROM event_seat "
            f"WHERE event_seat_id IN ({ph}) ORDER BY event_seat_id FOR UPDATE",
            seat_ids,
        )
        if len(seats) != len(seat_ids):
            raise HTTPException(status_code=404, detail="One or more seats not found")

        unavailable = [s["event_seat_id"] for s in seats if s["availability_status"] != "available"]
        if unavailable:
            raise HTTPException(status_code=409, detail=f"Seat(s) no longer available: {unavailable}")

        event = await fetch_one(
            db,
            f"SELECT COUNT(DISTINCT es.event_id) AS events, MIN(e.event_date) < CURDATE() AS event_passed "
            f"FROM event_seat es JOIN event e ON e.event_id = es.event_id WHERE es.event_seat_id IN ({ph})",
            seat_ids,
        )
        if event["events"] != 1:
            raise HTTPException(status_code=400, detail="All seats in one booking must be for the same event")
        if event["event_passed"]:
            raise HTTPException(status_code=400, detail="This event has already taken place")

        # Python computes the total for the payment row; trg_ticket_after_insert keeps
        # booking.total_amount equal to the same sum as each ticket is inserted.
        total = sum((s["price"] for s in seats), Decimal("0"))

        _, booking_id = await execute(
            db,
            "INSERT INTO booking (user_id, booking_status, total_amount) VALUES (%s, 'confirmed', %s)",
            (current_user["user_id"], total),
        )
        await execute(
            db,
            f"UPDATE event_seat SET availability_status = 'booked' WHERE event_seat_id IN ({ph})",
            seat_ids,
        )
        await execute_many(
            db,
            "INSERT INTO ticket (booking_id, event_seat_id, ticket_price, ticket_status, qr_code) "
            "VALUES (%s, %s, %s, 'active', %s)",
            [(booking_id, s["event_seat_id"], s["price"], str(uuid.uuid4())) for s in seats],
        )
        await execute(
            db,
            "INSERT INTO payment (booking_id, amount, payment_method, payment_status, payment_date, transaction_id) "
            "VALUES (%s, %s, %s, 'completed', NOW(), %s)",
            (booking_id, total, payload.payment_method, str(uuid.uuid4())),
        )

    return (await load_bookings(db, "b.booking_id = %s", (booking_id,)))[0]


@router.get("/me", response_model=list[BookingOut])
async def my_bookings(db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    return await load_bookings(db, "b.user_id = %s", (current_user["user_id"],))


@router.post("/{booking_id}/cancel", response_model=BookingOut)
async def cancel_booking(booking_id: int, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Cancel every remaining ticket of a booking. (Single tickets: POST /tickets/{id}/cancel.)"""
    async with transaction(db):
        booking = await fetch_one(
            db,
            "SELECT booking_id, booking_status FROM booking WHERE booking_id = %s AND user_id = %s FOR UPDATE",
            (booking_id, current_user["user_id"]),
        )
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        if booking["booking_status"] == "cancelled":
            raise HTTPException(status_code=400, detail="Booking already cancelled")

        state = await fetch_one(
            db,
            """
            SELECT MIN(e.event_date) < CURDATE()         AS event_passed,
                   COALESCE(SUM(t.ticket_status = 'used'), 0) AS used_tickets
            FROM ticket t
            JOIN event_seat es ON es.event_seat_id = t.event_seat_id
            JOIN event e       ON e.event_id = es.event_id
            WHERE t.booking_id = %s
            """,
            (booking_id,),
        )
        if state["event_passed"]:
            raise HTTPException(status_code=400, detail="This event has already taken place")
        if state["used_tickets"]:
            raise HTTPException(status_code=409, detail="Tickets from this booking have already been used")

        # Only still-active tickets: a ticket cancelled earlier may have had its seat resold since.
        # trg_ticket_after_update fires once per ticket here: it puts each seat back on sale and
        # recomputes booking.total_amount, so neither is repeated in Python.
        await execute(
            db,
            "UPDATE ticket SET ticket_status = 'cancelled' WHERE booking_id = %s AND ticket_status = 'active'",
            (booking_id,),
        )
        await execute(db, "UPDATE booking SET booking_status = 'cancelled' WHERE booking_id = %s", (booking_id,))
        await execute(db, "UPDATE payment SET payment_status = 'refunded' WHERE booking_id = %s", (booking_id,))

    return (await load_bookings(db, "b.booking_id = %s", (booking_id,)))[0]
