from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, BeforeValidator, EmailStr, Field


def _timedelta_to_time(v):
    """MySQL TIME columns come back from the driver as timedelta; the API speaks time."""
    if isinstance(v, timedelta):
        secs = int(v.total_seconds())
        return time(secs // 3600 % 24, secs // 60 % 60, secs % 60)
    return v


SqlTime = Annotated[time, BeforeValidator(_timedelta_to_time)]

# Same rule as the chk_phone_format CHECK constraint, so bad input gets a clear 422 first.
PHONE_PATTERN = r"^[+]?[0-9][0-9 -]{6,18}[0-9]$"
PhoneNumber = Annotated[str, Field(pattern=PHONE_PATTERN, max_length=20)]


def _not_in_future(v: date) -> date:
    # trg_user_before_insert enforces this in the database too; checking here gives a 422 with
    # the field name instead of a database round trip.
    if v > date.today():
        raise ValueError("Date of birth cannot be in the future")
    return v


BirthDate = Annotated[date, AfterValidator(_not_in_future)]


# ---------- Auth / User ----------

class UserRegister(BaseModel):
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    date_of_birth: BirthDate
    address: str | None = Field(default=None, max_length=255)
    phone_number: PhoneNumber | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    user_id: int
    first_name: str
    last_name: str
    email: str
    date_of_birth: date
    address: str | None = None
    role: Literal["user", "admin"] = "user"


class UserProfile(UserOut):
    """Profile read from v_user_profile: adds the derived age and the multivalued phones."""
    full_name: str
    age: int
    created_at: datetime
    phones: list[str] = []


class ProfileUpdate(BaseModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=50)
    last_name: str | None = Field(default=None, min_length=1, max_length=50)
    address: str | None = Field(default=None, max_length=255)


class PhoneIn(BaseModel):
    phone_number: PhoneNumber


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Venue / Seat ----------

class VenueOut(BaseModel):
    venue_id: int
    venue_name: str
    street: str | None = None
    city: str
    state: str
    seat_count: int | None = None


class SeatOut(BaseModel):
    seat_id: int
    row_num: str
    seat_number: str
    seat_type: str | None = None


# ---------- Event ----------

class EventOut(BaseModel):
    event_id: int
    venue_id: int
    event_name: str
    event_type: str | None = None
    event_date: date
    event_time: SqlTime
    base_price: Decimal
    venue: VenueOut | None = None
    seats_total: int | None = None
    seats_available: int | None = None


class AdminEventOut(EventOut):
    tickets_sold: int = 0
    revenue: Decimal = Decimal("0")


class EventSeatOut(BaseModel):
    event_seat_id: int
    seat_id: int
    availability_status: str
    price: Decimal
    seat: SeatOut


# ---------- Booking / Ticket / Payment ----------

class BookingCreate(BaseModel):
    event_seat_ids: list[int] = Field(min_length=1, max_length=10)
    payment_method: Literal["card", "upi", "netbanking", "wallet"] = "card"


class TicketOut(BaseModel):
    ticket_id: int
    event_seat_id: int
    ticket_price: Decimal
    ticket_status: str
    qr_code: str | None = None
    event_id: int | None = None
    event_name: str | None = None
    event_date: date | None = None
    event_time: SqlTime | None = None
    venue_name: str | None = None
    city: str | None = None
    row_num: str | None = None
    seat_number: str | None = None
    seat_type: str | None = None


class PaymentOut(BaseModel):
    payment_id: int
    amount: Decimal                       # charged at checkout
    refunded_amount: Decimal = Decimal("0")  # derived: amount - booking.total_amount
    payment_method: str
    payment_status: str
    payment_date: datetime | None = None
    transaction_id: str | None = None


class BookingOut(BaseModel):
    booking_id: int
    booking_date: datetime
    booking_status: str
    total_amount: Decimal
    user_name: str | None = None
    user_email: str | None = None
    tickets: list[TicketOut] = []
    payment: PaymentOut | None = None


# ---------- Admin inputs ----------

class VenueCreate(BaseModel):
    venue_name: str = Field(min_length=1, max_length=150)
    street: str | None = Field(default=None, max_length=150)
    city: str = Field(min_length=1, max_length=100)
    state: str = Field(min_length=1, max_length=100)


class SeatBlockCreate(BaseModel):
    """Adds a block of seats to a venue, e.g. rows A-C x 10 seats each."""
    row_labels: list[str] = Field(min_length=1, max_length=50)
    seats_per_row: int = Field(ge=1, le=100)
    seat_type: str = Field(default="Standard", min_length=1, max_length=30)


class EventCreate(BaseModel):
    venue_id: int
    event_name: str = Field(min_length=1, max_length=150)
    event_type: str | None = Field(default=None, max_length=50)
    event_date: date
    event_time: time
    base_price: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    # e.g. {"VIP": 2500, "Premium": 1500}; seat types not listed use base_price
    price_by_seat_type: dict[str, Decimal] = {}


class EventUpdate(BaseModel):
    event_name: str | None = Field(default=None, min_length=1, max_length=150)
    event_type: str | None = Field(default=None, max_length=50)
    event_date: date | None = None
    event_time: time | None = None
    base_price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    # when true, still-available seats are repriced to the new base price
    reprice_available: bool = False


class CheckInRequest(BaseModel):
    # The full QR value, or the 8-character code printed under the QR on the ticket
    code: str = Field(pattern=r"^\s*[0-9A-Fa-f-]{8,36}\s*$")


class CheckInResult(BaseModel):
    ticket: TicketOut
    booking_id: int
    holder_name: str
    holder_email: str


# ---------- Reports ----------

class RevenueReport(BaseModel):
    event_id: int
    event_name: str
    total_revenue: Decimal
    tickets_sold: int


class PopularEvent(BaseModel):
    event_id: int
    event_name: str
    tickets_sold: int


class SeatAvailability(BaseModel):
    event_id: int
    available: int
    locked: int
    booked: int


class EventAvailabilityRow(BaseModel):
    """One row of v_event_availability joined with v_event_sales."""
    event_id: int
    event_name: str
    event_date: date
    venue_name: str
    city: str
    seats_total: int
    seats_available: int
    seats_locked: int
    seats_booked: int
    tickets_sold: int
    revenue: Decimal


class AdminStats(BaseModel):
    users: int
    events: int
    confirmed_bookings: int
    tickets_sold: int
    revenue: Decimal
