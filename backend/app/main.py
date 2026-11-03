import logging
from contextlib import asynccontextmanager

from asyncmy.errors import MySQLError
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.database import close_pool, init_pool, signal_status
from app.routers import admin, auth, bookings, events, reports, tickets, users, venues

log = logging.getLogger("eticket")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool()
    yield
    await close_pool()


app = FastAPI(title="E-Ticket Booking Platform API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(MySQLError)
async def mysql_error_handler(request: Request, exc: MySQLError):
    """A trigger or stored procedure refused the change: pass its message on with the right status.
    Anything else is a genuine server fault."""
    status = signal_status(exc)
    if status:
        return JSONResponse(status_code=status, content={"detail": exc.args[1]})
    log.exception("Database error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(status_code=500, content={"detail": "Database error"})


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(venues.router)
app.include_router(events.router)
app.include_router(bookings.router)
app.include_router(tickets.router)
app.include_router(reports.router)
app.include_router(admin.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
