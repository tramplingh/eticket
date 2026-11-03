from fastapi import APIRouter, Depends

from app.database import fetch_all, get_db
from app.schemas import VenueOut

router = APIRouter(prefix="/venues", tags=["venues"])


@router.get("", response_model=list[VenueOut])
async def list_venues(db=Depends(get_db)):
    return await fetch_all(
        db,
        """
        SELECT v.venue_id, v.venue_name, v.street, v.city, v.state, COUNT(s.seat_id) AS seat_count
        FROM venue v
        LEFT JOIN seat s ON s.venue_id = v.venue_id
        GROUP BY v.venue_id, v.venue_name, v.street, v.city, v.state
        ORDER BY v.city, v.venue_name
        """,
    )
