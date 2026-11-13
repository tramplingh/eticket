"""End-to-end test of the E-Ticket platform through its real HTTP API.

It does what the website does (register, search, book, cancel, admin, check-in) and also
checks the database rules behind it: row locking, triggers, the stored procedure,
constraints and views.

How to run (backend must already be running on port 8000):
    cd backend
    venv\\Scripts\\python scripts\\smoke_test.py          (Windows)
    venv/bin/python scripts/smoke_test.py              (macOS / Linux)
    ... add  --api http://host:port  if the backend runs elsewhere.

Needs the seed logins from sql/03_seed.sql. Uses only the Python standard library.
Safe to run repeatedly: every run registers its own test user. It does leave a few test
bookings behind, so re-run 01 -> 02 -> 03 before your demo for clean data.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

ADMIN = ("admin@eticket.com", "Admin@123")
PRIYA = ("priya.sharma@example.com", "Password@123")
RAHUL = ("rahul.verma@example.com", "Password@123")

API = "http://localhost:8000"
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # never route localhost via a proxy
_passed = 0
_started = time.time()


# ---------------------------------------------------------------- helpers

def call(method, path, body=None, token=None):
    """Return (status_code, parsed_json_or_text)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with _opener.open(req, timeout=30) as res:
            raw = res.read()
            return res.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as err:
        raw = err.read()
        try:
            return err.code, json.loads(raw)
        except ValueError:
            return err.code, raw.decode(errors="replace")
    except urllib.error.URLError as err:
        sys.exit(f"\nCannot reach the API at {API} ({err.reason}).\n"
                 f"Start it first:  venv\\Scripts\\python -m uvicorn app.main:app --reload")


def check(condition, label, got=None, hint=None):
    global _passed
    if condition:
        _passed += 1
        print(f"  PASS  {label}")
        return
    print(f"  FAIL  {label}")
    if got is not None:
        print(f"        got: {str(got)[:400]}")
    if hint:
        print(f"        hint: {hint}")
    print(f"\n{_passed} checks passed before this failure.")
    sys.exit(1)


def section(title):
    print(f"\n{title}")
    print("-" * len(title))


def login(creds):
    status, body = call("POST", "/auth/login", {"email": creds[0], "password": creds[1]})
    check(status == 200, f"log in as {creds[0]}", body,
          "Seed users missing? Run sql/01_schema.sql, 02_programmability.sql, 03_seed.sql in Workbench.")
    return body["access_token"]


def seat_map(event_id):
    status, body = call("GET", f"/events/{event_id}/seats")
    return {s["event_seat_id"]: s for s in body} if status == 200 else {}


def money(x):
    return round(float(x), 2)


# ---------------------------------------------------------------- tests

def main():
    run = int(time.time())
    today = date.today()

    # ------------------------------------------------------------ 0
    section("0. Backend is up")
    status, body = call("GET", "/health")
    check(status == 200 and body == {"status": "ok"}, "GET /health", body)

    # ------------------------------------------------------------ 1
    section("1. Register and log in  (synopsis: register a new user)")
    email = f"test.{run}@example.com"
    dob = "2000-02-29"
    status, body = call("POST", "/auth/register", {
        "first_name": "Smoke", "last_name": "Test", "email": email, "password": "Password@123",
        "date_of_birth": dob, "address": "Test Street, Bengaluru", "phone_number": "+91 99999 00000"})
    check(status == 201 and body["user"]["email"] == email, "register a new user", body)
    me = body["access_token"]

    status, body = call("POST", "/auth/register", {
        "first_name": "X", "last_name": "Y", "email": email, "password": "Password@123", "date_of_birth": dob})
    check(status == 400, "same email again is rejected (UNIQUE email)", body)

    status, body = call("POST", "/auth/register", {
        "first_name": "X", "last_name": "Y", "email": f"future.{run}@example.com", "password": "Password@123",
        "date_of_birth": str(today + timedelta(days=5))})
    check(status == 422, "date of birth in the future is rejected", body)

    status, body = call("POST", "/auth/register", {
        "first_name": "X", "last_name": "Y", "email": f"phone.{run}@example.com", "password": "Password@123",
        "date_of_birth": dob, "phone_number": "call me"})
    check(status == 422, "invalid phone number is rejected", body)

    status, body = call("POST", "/auth/login", {"email": email, "password": "wrong-password"})
    check(status == 401, "wrong password is rejected", body)

    status, body = call("GET", "/auth/me", token=me)
    check(status == 200 and body["email"] == email and body["role"] == "user", "GET /auth/me returns the new user", body)

    # ------------------------------------------------------------ 2
    section("2. Profile  (derived attribute: age, multivalued attribute: phones)")
    born = date.fromisoformat(dob)
    expected_age = today.year - born.year - ((today.month, today.day) < (born.month, born.day))
    status, body = call("GET", "/users/me", token=me)
    check(status == 200 and body["age"] == expected_age, f"age is derived from date of birth ({expected_age})", body)
    check(body["phones"] == ["+91 99999 00000"], "phone given at sign-up is stored in user_phone", body)

    status, body = call("POST", "/users/me/phones", {"phone_number": "+91 80 1111 2222"}, me)
    check(status == 201 and len(body["phones"]) == 2, "add a second phone number", body)
    status, body = call("POST", "/users/me/phones", {"phone_number": "+91 80 1111 2222"}, me)
    check(status == 409, "duplicate phone rejected by composite primary key", body)
    status, body = call("DELETE", "/users/me/phones/" + urllib.parse.quote("+91 80 1111 2222", safe=""), token=me)
    check(status == 200 and body["phones"] == ["+91 99999 00000"], "remove a phone number", body)
    status, body = call("PUT", "/users/me", {"address": "  MG Road, Bengaluru  "}, me)
    check(status == 200 and body["address"] == "MG Road, Bengaluru", "update address", body)

    # ------------------------------------------------------------ 3
    section("3. Events and search  (synopsis: available events, by venue, search)")
    status, events = call("GET", "/events")
    check(status == 200 and len(events) > 0, f"list available events ({len(events) if status == 200 else 0} found)", events,
          "No upcoming events: the seed dates have passed. Re-run 01 -> 02 -> 03.")
    check(all(e["event_date"] >= str(today) for e in events), "only today's and future events are listed")

    status, types = call("GET", "/events/types")
    check(status == 200 and len(types) > 0, f"event types: {', '.join(types)}", types)
    status, body = call("GET", "/events?" + urllib.parse.urlencode({"event_type": types[0]}))
    check(status == 200 and body and all(e["event_type"] == types[0] for e in body), f"filter by type '{types[0]}'", body)

    venue_id = events[0]["venue_id"]
    status, body = call("GET", f"/events?venue_id={venue_id}")
    check(status == 200 and body and all(e["venue_id"] == venue_id for e in body), "filter by venue", body)

    status, body = call("GET", "/events?" + urllib.parse.urlencode({"event_date": events[0]["event_date"]}))
    check(status == 200 and body and all(e["event_date"] == events[0]["event_date"] for e in body), "filter by date", body)

    # Time windows ("When" filter). 4 of the 10 seeded events already happened, so past windows are not empty.
    def window(params):
        return call("GET", "/events?" + urllib.parse.urlencode(params))

    lo, hi = str(today - timedelta(days=7)), str(today - timedelta(days=1))
    status, past7 = window({"period": "past_7"})
    check(status == 200 and past7 and all(lo <= e["event_date"] <= hi for e in past7),
          f"past 7 days: {len(past7) if status == 200 else 0} events, all between {lo} and {hi}", past7,
          "No past events found. Re-run sql/03_seed.sql, which dates 4 of its 10 events in the past.")
    dates = [e["event_date"] for e in past7]
    check(dates == sorted(dates, reverse=True), "past windows list the most recent event first")

    lo30 = str(today - timedelta(days=30))
    status, past30 = window({"period": "past_30"})
    check(status == 200 and len(past30) >= len(past7) and all(lo30 <= e["event_date"] <= hi for e in past30),
          f"past 30 days: {len(past30)} events, all between {lo30} and {hi}", past30)

    hi7 = str(today + timedelta(days=6))
    status, next7 = window({"period": "next_7"})
    check(status == 200 and all(str(today) <= e["event_date"] <= hi7 for e in next7),
          f"next 7 days: {len(next7)} events, all between {today} and {hi7}", next7)

    last_month = (today.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    status, by_month = window({"month": last_month})
    check(status == 200 and all(e["event_date"].startswith(last_month) for e in by_month),
          f"specific month {last_month}: {len(by_month)} events, all in that month", by_month)
    status, lm = window({"period": "last_month"})
    check(status == 200 and [e["event_id"] for e in lm] == [e["event_id"] for e in reversed(by_month)],
          "'last month' preset matches choosing that month by hand", lm)

    lo_r, hi_r = str(today - timedelta(days=10)), str(today + timedelta(days=10))
    status, rng = window({"date_from": lo_r, "date_to": hi_r})
    check(status == 200 and rng and all(lo_r <= e["event_date"] <= hi_r for e in rng),
          f"custom range {lo_r} to {hi_r}: {len(rng) if status == 200 else 0} events", rng)
    status, body = window({"date_from": str(today), "date_to": str(today - timedelta(days=1))})
    check(status == 400, "a range that ends before it starts is rejected", body)
    status, body = window({"month": "2026-13"})
    check(status == 422, "an invalid month is rejected", body)
    past_event = past30[0] if past30 else None

    word = events[0]["event_name"].split()[0].strip(":,")
    status, body = call("GET", "/events?" + urllib.parse.urlencode({"q": word.lower()}))
    check(status == 200 and any(e["event_id"] == events[0]["event_id"] for e in body), f"search by name ('{word.lower()}')", body)

    # Book on the upcoming event with the most free seats.
    target = max(events, key=lambda e: e["seats_available"])
    eid = target["event_id"]
    check(target["seats_available"] >= 15, f"test event: {target['event_name']} ({target['seats_available']} seats free)",
          target, "Fewer than 15 free seats anywhere. Re-run 01 -> 02 -> 03.")
    seats = seat_map(eid)
    check(len(seats) == target["seats_total"], "seat map size matches the event's seat count (synopsis: available seats)",
          f"{len(seats)} vs {target['seats_total']}")
    free = [s for s in seats.values() if s["availability_status"] == "available"]

    # ------------------------------------------------------------ 4
    section("4. Booking  (synopsis: create booking, generate tickets, record payment)")
    pick = free[:3]
    status, booking = call("POST", "/bookings", {"event_seat_ids": [s["event_seat_id"] for s in pick],
                                                 "payment_method": "upi"}, me)
    check(status == 201, "book 3 seats in one transaction", booking)
    expected = money(sum(float(s["price"]) for s in pick))
    check(money(booking["total_amount"]) == expected, f"booking total = sum of seat prices ({expected})", booking["total_amount"])
    check(money(booking["payment"]["amount"]) == expected and booking["payment"]["payment_status"] == "completed",
          "payment recorded for the same amount", booking["payment"])
    qrs = [t["qr_code"] for t in booking["tickets"]]
    check(len(qrs) == 3 and all(qrs) and len(set(qrs)) == 3, "3 tickets issued, each with a unique QR code", qrs)
    seats = seat_map(eid)
    check(all(seats[s["event_seat_id"]]["availability_status"] == "booked" for s in pick), "the 3 seats now show as booked")

    status, body = call("POST", "/bookings", {"event_seat_ids": [pick[0]["event_seat_id"]]}, me)
    check(status == 409, "booking an already-booked seat is rejected", body)

    other = next((e for e in events if e["event_id"] != eid and e["seats_available"] > 0), None)
    if other:
        other_seat = next(s for s in seat_map(other["event_id"]).values() if s["availability_status"] == "available")
        status, body = call("POST", "/bookings", {"event_seat_ids": [free[5]["event_seat_id"], other_seat["event_seat_id"]]}, me)
        check(status == 400, "seats from two different events in one booking are rejected", body)

    status, body = call("POST", "/bookings", {"event_seat_ids": [s["event_seat_id"] for s in free[3:14]]}, me)
    check(status == 422, "more than 10 seats in one booking is rejected", body)

    if past_event:
        past_free = next((x for x in seat_map(past_event["event_id"]).values() if x["availability_status"] == "available"), None)
        if past_free:
            status, body = call("POST", "/bookings", {"event_seat_ids": [past_free["event_seat_id"]]}, me)
            check(status == 400, f"booking a seat for a past event ({past_event['event_name']}) is rejected", body)

    # ------------------------------------------------------------ 5
    section("5. Concurrency  (two buyers, same seat, same instant)")
    rahul = login(RAHUL)
    contested = free[10]["event_seat_id"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda tok: call("POST", "/bookings", {"event_seat_ids": [contested]}, tok), [me, rahul]))
    codes = sorted(r[0] for r in results)
    check(codes == [201, 409], "exactly one buyer gets the seat, the other gets 409 (SELECT ... FOR UPDATE)", codes)

    # ------------------------------------------------------------ 6
    section("6. Cancellation  (synopsis: cancel a ticket; stored procedure + triggers)")
    t0, t1 = booking["tickets"][0], booking["tickets"][1]
    status, after = call("POST", f"/tickets/{t0['ticket_id']}/cancel", token=me)
    check(status == 200, "cancel ONE ticket (CALL sp_cancel_ticket)", after)
    live = [t for t in after["tickets"] if t["ticket_status"] == "active"]
    check(after["booking_status"] == "confirmed" and len(live) == 2, "booking stays confirmed with 2 live tickets")
    check(after["payment"]["payment_status"] == "partially_refunded", "payment becomes partially_refunded", after["payment"])
    check(money(after["total_amount"]) == money(expected - float(t0["ticket_price"])),
          "trigger recomputed booking total (derived attribute)", after["total_amount"])
    check(money(after["payment"]["refunded_amount"]) == money(t0["ticket_price"]), "refunded amount = cancelled ticket's price",
          after["payment"])
    check(seat_map(eid)[t0["event_seat_id"]]["availability_status"] == "available", "trigger put the seat back on sale")

    status, body = call("POST", f"/tickets/{t0['ticket_id']}/cancel", token=me)
    check(status == 409, "cancelling the same ticket twice is rejected (SIGNAL 50409)", body)
    status, body = call("POST", f"/tickets/{t1['ticket_id']}/cancel", token=rahul)
    check(status == 404, "cancelling someone else's ticket is rejected (SIGNAL 50404)", body)

    status, resale = call("POST", "/bookings", {"event_seat_ids": [t0["event_seat_id"]], "payment_method": "card"}, rahul)
    check(status == 201, "the freed seat can be sold to someone else", resale)

    status, body = call("POST", f"/bookings/{booking['booking_id']}/cancel", token=me)
    check(status == 200 and body["booking_status"] == "cancelled", "cancel the whole booking", body)
    check(body["payment"]["payment_status"] == "refunded" and money(body["total_amount"]) == 0,
          "payment refunded, booking total now 0", body["payment"])
    check(money(body["payment"]["refunded_amount"]) == expected, f"refunded amount = full payment ({expected})", body["payment"])
    seats = seat_map(eid)
    check(seats[t0["event_seat_id"]]["availability_status"] == "booked",
          "resold seat stays booked for the new owner (old booking does not free it)")
    check(all(seats[t["event_seat_id"]]["availability_status"] == "available" for t in booking["tickets"][1:]),
          "the booking's other seats are freed")
    status, body = call("POST", f"/bookings/{booking['booking_id']}/cancel", token=me)
    check(status == 400, "cancelling an already-cancelled booking is rejected", body)

    status, history = call("GET", "/bookings/me", token=me)
    ids = [b["booking_id"] for b in history] if status == 200 else []
    check(booking["booking_id"] in ids, "booking appears in the user's history (synopsis: booking history)", history)

    # ------------------------------------------------------------ 7
    section("7. Admin reports  (synopsis: revenue, popular events, seat counts, bookings by date)")
    admin = login(ADMIN)
    status, body = call("GET", "/admin/stats", token=me)
    check(status == 403, "a customer cannot open admin endpoints", body)
    status, body = call("GET", "/reports/popular-events", token=me)
    check(status == 403, "a customer cannot open reports", body)

    status, stats = call("GET", "/admin/stats", token=admin)
    check(status == 200, f"dashboard: revenue {stats['revenue']}, {stats['tickets_sold']} tickets sold", stats)

    status, rows = call("GET", "/reports/seat-availability", token=admin)
    check(status == 200 and rows, f"seat counts for all {len(rows)} events (views)", rows)
    check(all(r["seats_available"] + r["seats_locked"] + r["seats_booked"] == r["seats_total"] for r in rows),
          "for every event: available + held + booked = total seats")
    check(all(r["tickets_sold"] == r["seats_booked"] for r in rows), "for every event: tickets sold = seats booked",
          [(r["event_name"], r["tickets_sold"], r["seats_booked"]) for r in rows if r["tickets_sold"] != r["seats_booked"]])
    check(money(sum(float(r["revenue"]) for r in rows)) == money(stats["revenue"]),
          "sum of event revenues = dashboard revenue")

    row = next(r for r in rows if r["event_id"] == eid)
    status, rev = call("GET", f"/reports/revenue/{eid}", token=admin)
    check(status == 200 and money(rev["total_revenue"]) == money(row["revenue"]) and rev["tickets_sold"] == row["tickets_sold"],
          "revenue report for one event matches the table", rev)
    status, av = call("GET", f"/reports/seat-availability/{eid}", token=admin)
    check(status == 200 and av["booked"] == row["seats_booked"] and av["available"] == row["seats_available"],
          "seat availability for one event matches the table", av)

    status, pop = call("GET", "/reports/popular-events", token=admin)
    sold = [p["tickets_sold"] for p in pop] if status == 200 else []
    check(status == 200 and sold == sorted(sold, reverse=True), f"most popular events, best first: {pop[0]['event_name'] if pop else '-'}", pop)

    status, day = call("GET", f"/reports/bookings-by-date?booking_date={today}", token=admin)
    day_ids = {b["booking_id"] for b in day} if status == 200 else set()
    check({booking["booking_id"], resale["booking_id"]} <= day_ids, f"today's bookings include this run's bookings ({len(day_ids)} today)")

    status, allb = call("GET", "/admin/bookings", token=admin)
    check(status == 200 and len(allb) > 0, "admin can list all bookings", allb)

    # Admin time windows: events by event date, bookings and dashboard totals by booking date.
    status, past_ev = call("GET", "/admin/events?period=past", token=admin)
    check(status == 200 and past_ev and all(e["event_date"] < str(today) for e in past_ev),
          f"admin events tab, past events only: {len(past_ev) if status == 200 else 0} events", past_ev)
    status, all_ev = call("GET", "/admin/events", token=admin)
    check(status == 200 and len(all_ev) > len(past_ev), "admin events tab lists past and upcoming events by default", all_ev)

    lo7 = str(today - timedelta(days=6))
    status, week = call("GET", "/admin/bookings?period=past_7", token=admin)
    check(status == 200 and week and all(b["booking_date"][:10] >= lo7 for b in week),
          f"bookings made in the last 7 days: {len(week) if status == 200 else 0}, all on or after {lo7}", week)
    status, s7 = call("GET", "/admin/stats?period=past_7", token=admin)
    live = sum(1 for b in week for t in b["tickets"] if t["ticket_status"] != "cancelled")
    check(status == 200 and s7["tickets_sold"] == live and money(s7["revenue"]) <= money(stats["revenue"]),
          f"dashboard for the last 7 days: {s7['tickets_sold'] if status == 200 else '-'} tickets, matching the bookings list", s7)
    status, pastb = call("GET", "/admin/bookings?event_when=past", token=admin)
    check(status == 200 and pastb and all(any(t["event_date"] < str(today) for t in b["tickets"]) for b in pastb),
          f"bookings for events that already happened: {len(pastb) if status == 200 else 0}", pastb)
    status, cancelled = call("GET", "/admin/bookings?status=cancelled", token=admin)
    check(status == 200 and all(b["booking_status"] == "cancelled" for b in cancelled), "filter bookings by status", cancelled)

    # ------------------------------------------------------------ 8
    section("8. Admin changes  (constraints and triggers)")
    status, venues = call("GET", "/venues")
    v = next(x for x in venues if x["seat_count"])
    status, body = call("POST", "/admin/venues", {"venue_name": v["venue_name"], "city": v["city"], "state": v["state"]}, admin)
    check(status == 409, "duplicate venue in the same city is rejected (UNIQUE)", body)

    first = events[0]
    status, body = call("POST", "/admin/events", {"venue_id": first["venue_id"], "event_name": "Clash test",
                                                  "event_date": first["event_date"], "event_time": first["event_time"],
                                                  "base_price": 100}, admin)
    check(status == 409, "two events in the same venue slot are rejected (UNIQUE)", body)
    status, body = call("POST", "/admin/events", {"venue_id": v["venue_id"], "event_name": "Past test",
                                                  "event_date": str(today - timedelta(days=1)), "event_time": "10:00:00",
                                                  "base_price": 100}, admin)
    check(status == 400, "an event in the past is rejected", body)

    status, seat_types = call("GET", f"/admin/venues/{v['venue_id']}/seat-types", token=admin)
    tier = seat_types[0] if status == 200 and seat_types else None
    new_date = str(today + timedelta(days=300 + run % 200))
    new_time = f"{run % 24:02d}:{run % 60:02d}:00"
    status, new = call("POST", "/admin/events", {
        "venue_id": v["venue_id"], "event_name": f"Smoke test event {run}", "event_type": "Test",
        "event_date": new_date, "event_time": new_time, "base_price": 300,
        "price_by_seat_type": {tier: 450} if tier else {}}, admin)
    check(status == 201 and new["seats_total"] == v["seat_count"],
          f"create an event: seat inventory generated for all {v['seat_count']} seats (INSERT ... SELECT)", new)
    new_id = new["event_id"]
    prices = {s["price"] for s in seat_map(new_id).values()}
    check("300.00" in prices and (not tier or "450.00" in prices), f"per-seat-type price applied ({sorted(prices)})")

    status, body = call("PUT", f"/admin/events/{new_id}", {"base_price": 350, "reprice_available": True}, admin)
    check(status == 200 and body["base_price"] == "350.00", "edit an event and reprice unsold seats", body)
    status, body = call("PUT", f"/admin/events/{new_id}", {"event_date": str(today - timedelta(days=3))}, admin)
    check(status == 400, "moving an event into the past is rejected (trigger)", body)
    status, body = call("DELETE", f"/admin/events/{new_id}", token=admin)
    check(status == 204, "delete an event with no bookings", body)
    status, body = call("DELETE", f"/admin/events/{eid}", token=admin)
    check(status == 409, "an event with bookings cannot be deleted", body)

    # ------------------------------------------------------------ 9
    section("9. Gate check-in  (ticket status: active -> used)")
    ticket = resale["tickets"][0]
    code = ticket["qr_code"][:8]
    status, body = call("POST", "/admin/tickets/check-in", {"code": code.upper()}, admin)
    check(status == 200 and body["ticket"]["ticket_status"] == "used" and body["holder_name"] == "Rahul Verma",
          f"check in with the 8-character code {code}", body)
    status, body = call("POST", "/admin/tickets/check-in", {"code": ticket["qr_code"]}, admin)
    check(status == 409, "the same ticket cannot be admitted twice", body)
    status, body = call("POST", "/admin/tickets/check-in", {"code": "abc%_def"}, admin)
    check(status == 422, "wildcards in the code are rejected", body)
    status, body = call("POST", f"/tickets/{ticket['ticket_id']}/cancel", token=rahul)
    check(status == 409, "a used ticket cannot be cancelled (trigger)", body)
    status, body = call("POST", f"/bookings/{resale['booking_id']}/cancel", token=rahul)
    check(status == 409, "a booking with a used ticket cannot be cancelled", body)

    print(f"\nALL {_passed} CHECKS PASSED in {time.time() - _started:.1f}s")
    print(f"Test user left behind: {email}. Re-run 01 -> 02 -> 03 for clean demo data.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="End-to-end test of the E-Ticket API")
    parser.add_argument("--api", default=API, help="backend base URL (default %(default)s)")
    API = parser.parse_args().api.rstrip("/")
    main()
