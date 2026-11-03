from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import fetch_all, fetch_one, get_db
from app.queries import EVENT_SELECT, shape_event
from app.schemas import EventOut, EventSeatOut

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventOut])
async def search_events(
    event_type: str | None = Query(None),
    event_date: date | None = Query(None),
    venue_id: int | None = Query(None),
    q: str | None = Query(None, description="Search in the event name"),
    include_past: bool = Query(False, description="Also return events that have already happened"),
    db=Depends(get_db),
):
    # "Display available events": by default only today's and future events are listed.
    conditions, args = ([] if include_past else ["e.event_date >= CURDATE()"]), []
    if event_type:
        conditions.append("e.event_type = %s")
        args.append(event_type)
    if event_date:
        conditions.append("e.event_date = %s")
        args.append(event_date)
    if venue_id:
        conditions.append("e.venue_id = %s")
        args.append(venue_id)
    if q:
        conditions.append("e.event_name LIKE %s")
        args.append(f"%{q}%")  # the wildcards travel inside the parameter, not the SQL text

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = await fetch_all(db, f"{EVENT_SELECT} {where} ORDER BY e.event_date, e.event_time", args)
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
