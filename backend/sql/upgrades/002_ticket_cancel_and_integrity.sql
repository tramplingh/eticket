-- =====================================================================
--  Upgrade 002 — ONLY for a database created before 01_schema.sql existed
--  (i.e. the eticket_booking you have been developing against).
--  A fresh install (01 -> 02 -> 03) already includes all of this.
--
--  Run as root, after upgrades/001_add_user_role.sql has been applied.
--  Then run 02_programmability.sql.
-- =====================================================================

USE eticket_booking;

-- Partial refunds: cancelling some (not all) tickets of a booking.
ALTER TABLE payment
  MODIFY payment_status
    ENUM('pending','completed','failed','refunded','partially_refunded')
    NOT NULL DEFAULT 'pending';

-- At most one live ticket per event_seat (cancelled tickets keep history).
ALTER TABLE ticket
  ADD COLUMN live_seat_id INT
    GENERATED ALWAYS AS (IF(ticket_status = 'cancelled', NULL, event_seat_id)) STORED,
  ADD CONSTRAINT uq_ticket_live_seat UNIQUE (live_seat_id);

-- QR codes are looked up at check-in, so they must be unique and indexed.
ALTER TABLE ticket ADD CONSTRAINT uq_ticket_qr UNIQUE (qr_code);

-- The app account now also calls a stored procedure.
GRANT EXECUTE ON eticket_booking.* TO 'eticket_app'@'localhost';
