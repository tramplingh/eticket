"""Single-ticket operations for customers."""
from fastapi import APIRouter, Depends

from app.database import execute, fetch_one, get_db
from app.deps import get_current_user
from app.queries import load_bookings
from app.schemas import BookingOut

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.post("/{ticket_id}/cancel", response_model=BookingOut)
async def cancel_ticket(ticket_id: int, db=Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Synopsis operation "Cancel a ticket".

    The whole job is the stored procedure sp_cancel_ticket (sql/02_programmability.sql): it checks
    ownership and status, cancels the ticket in its own transaction, and settles the booking and
    payment. If it refuses (not yours, already cancelled, event over) it raises SIGNAL with
    MYSQL_ERRNO 50404 / 50409 / 50400, which main.py returns as HTTP 404 / 409 / 400.
    """
    await execute(db, "CALL sp_cancel_ticket(%s, %s)", (ticket_id, current_user["user_id"]))

    row = await fetch_one(db, "SELECT booking_id FROM ticket WHERE ticket_id = %s", (ticket_id,))
    return (await load_bookings(db, "b.booking_id = %s", (row["booking_id"],)))[0]
