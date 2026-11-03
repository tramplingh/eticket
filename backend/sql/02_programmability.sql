-- =====================================================================
--  E-TICKET BOOKING PLATFORM  ·  02_programmability.sql
--  Views, triggers and stored procedures. Run after 01_schema.sql.
--  Safe to re-run: every object is dropped/replaced first, and it also
--  works on an older database once upgrades/002 has been applied.
--
--  Error numbers raised with SIGNAL follow one convention the API relies
--  on: MYSQL_ERRNO = 50000 + HTTP status (50400 bad request, 50404 not
--  found, 50409 conflict). app/database.py translates them back.
-- =====================================================================

USE eticket_booking;


-- =====================================================================
--  VIEWS
-- =====================================================================

-- Derived attribute: age is computed from date_of_birth, never stored,
-- so it can never go stale.
CREATE OR REPLACE VIEW v_user_profile AS
SELECT u.user_id,
       u.first_name,
       u.last_name,
       CONCAT(u.first_name, ' ', u.last_name)            AS full_name,
       u.email,
       u.date_of_birth,
       TIMESTAMPDIFF(YEAR, u.date_of_birth, CURDATE())   AS age,
       u.address,
       u.role,
       u.created_at,
       (SELECT COUNT(*) FROM user_phone p WHERE p.user_id = u.user_id) AS phone_count
FROM `user` u;


-- Seat counts per event by status (conditional aggregation).
-- LEFT JOIN keeps events that have no seat inventory yet.
CREATE OR REPLACE VIEW v_event_availability AS
SELECT e.event_id,
       e.event_name,
       e.event_type,
       e.event_date,
       e.event_time,
       v.venue_id,
       v.venue_name,
       v.city,
       COUNT(es.event_seat_id)                                                   AS seats_total,
       CAST(COALESCE(SUM(es.availability_status = 'available'), 0) AS UNSIGNED)  AS seats_available,
       CAST(COALESCE(SUM(es.availability_status = 'locked'),    0) AS UNSIGNED)  AS seats_locked,
       CAST(COALESCE(SUM(es.availability_status = 'booked'),    0) AS UNSIGNED)  AS seats_booked
FROM event e
JOIN venue v           ON v.venue_id = e.venue_id
LEFT JOIN event_seat es ON es.event_id = e.event_id
GROUP BY e.event_id, e.event_name, e.event_type, e.event_date, e.event_time,
         v.venue_id, v.venue_name, v.city;


-- Tickets sold and revenue per event. Cancelled tickets do not count.
-- The ticket filter sits in the ON clause, not WHERE, so events with no
-- sales still appear with 0 instead of vanishing from the LEFT JOIN.
CREATE OR REPLACE VIEW v_event_sales AS
SELECT e.event_id,
       e.event_name,
       e.event_date,
       COUNT(t.ticket_id)               AS tickets_sold,
       COALESCE(SUM(t.ticket_price), 0) AS revenue
FROM event e
LEFT JOIN event_seat es ON es.event_id = e.event_id
LEFT JOIN ticket t      ON t.event_seat_id = es.event_seat_id
                       AND t.ticket_status <> 'cancelled'
GROUP BY e.event_id, e.event_name, e.event_date;


-- One row per ticket with everything around it: an 8-table join that
-- puts the normalised data back together for reading.
CREATE OR REPLACE VIEW v_booking_details AS
SELECT b.booking_id,
       b.booking_date,
       b.booking_status,
       b.total_amount,
       u.user_id,
       CONCAT(u.first_name, ' ', u.last_name) AS customer,
       u.email,
       t.ticket_id,
       t.ticket_status,
       t.ticket_price,
       t.qr_code,
       e.event_id,
       e.event_name,
       e.event_type,
       e.event_date,
       e.event_time,
       v.venue_name,
       v.city,
       s.row_num,
       s.seat_number,
       s.seat_type,
       p.payment_method,
       p.payment_status,
       p.amount                    AS amount_paid,
       (p.amount - b.total_amount) AS amount_refunded,
       p.transaction_id
FROM booking b
JOIN `user` u          ON u.user_id        = b.user_id
JOIN ticket t          ON t.booking_id     = b.booking_id
JOIN event_seat es     ON es.event_seat_id = t.event_seat_id
JOIN event e           ON e.event_id       = es.event_id
JOIN venue v           ON v.venue_id       = e.venue_id
JOIN seat s            ON s.seat_id        = es.seat_id
LEFT JOIN payment p    ON p.booking_id     = b.booking_id;


-- =====================================================================
--  TRIGGERS
--  CHECK constraints can only look at the row being written and may not
--  call CURDATE(). Rules that need "today" or another table live here.
-- =====================================================================

DROP TRIGGER IF EXISTS trg_user_before_insert;
DROP TRIGGER IF EXISTS trg_user_before_update;
DROP TRIGGER IF EXISTS trg_event_before_insert;
DROP TRIGGER IF EXISTS trg_event_before_update;
DROP TRIGGER IF EXISTS trg_event_seat_before_insert;
DROP TRIGGER IF EXISTS trg_ticket_before_update;
DROP TRIGGER IF EXISTS trg_ticket_after_insert;
DROP TRIGGER IF EXISTS trg_ticket_after_update;

DELIMITER $$

-- A date of birth cannot be in the future.
CREATE TRIGGER trg_user_before_insert
BEFORE INSERT ON `user`
FOR EACH ROW
BEGIN
  IF NEW.date_of_birth > CURDATE() THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Date of birth cannot be in the future', MYSQL_ERRNO = 50400;
  END IF;
END$$

CREATE TRIGGER trg_user_before_update
BEFORE UPDATE ON `user`
FOR EACH ROW
BEGIN
  IF NEW.date_of_birth > CURDATE() THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Date of birth cannot be in the future', MYSQL_ERRNO = 50400;
  END IF;
END$$


-- Events cannot be scheduled (or moved) into the past.
CREATE TRIGGER trg_event_before_insert
BEFORE INSERT ON event
FOR EACH ROW
BEGIN
  IF NEW.event_date < CURDATE() THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Event date cannot be in the past', MYSQL_ERRNO = 50400;
  END IF;
END$$

CREATE TRIGGER trg_event_before_update
BEFORE UPDATE ON event
FOR EACH ROW
BEGIN
  IF NEW.event_date <> OLD.event_date AND NEW.event_date < CURDATE() THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Event date cannot be moved into the past', MYSQL_ERRNO = 50400;
  END IF;
END$$


-- Cross-table rule: a seat may only go on sale for an event held at the
-- venue that seat belongs to.
CREATE TRIGGER trg_event_seat_before_insert
BEFORE INSERT ON event_seat
FOR EACH ROW
BEGIN
  IF (SELECT venue_id FROM seat  WHERE seat_id  = NEW.seat_id)
  <> (SELECT venue_id FROM event WHERE event_id = NEW.event_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Seat does not belong to the venue of this event', MYSQL_ERRNO = 50400;
  END IF;
END$$


-- Ticket lifecycle: active -> cancelled, or active -> used. Nothing else.
-- A ticket's seat, booking and price are fixed once issued.
CREATE TRIGGER trg_ticket_before_update
BEFORE UPDATE ON ticket
FOR EACH ROW
BEGIN
  IF NEW.ticket_status <> OLD.ticket_status AND OLD.ticket_status <> 'active' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Only an active ticket can change status', MYSQL_ERRNO = 50409;
  END IF;
  IF NEW.event_seat_id <> OLD.event_seat_id
     OR NEW.booking_id <> OLD.booking_id
     OR NEW.ticket_price <> OLD.ticket_price THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Seat, booking and price of an issued ticket cannot change', MYSQL_ERRNO = 50400;
  END IF;
END$$


-- Derived attribute maintenance: booking.total_amount always equals the
-- sum of its non-cancelled ticket prices.
CREATE TRIGGER trg_ticket_after_insert
AFTER INSERT ON ticket
FOR EACH ROW
BEGIN
  UPDATE booking
     SET total_amount = (SELECT COALESCE(SUM(t.ticket_price), 0)
                           FROM ticket t
                          WHERE t.booking_id = NEW.booking_id
                            AND t.ticket_status <> 'cancelled')
   WHERE booking_id = NEW.booking_id;
END$$


-- When a ticket is cancelled, by any path (the app, the stored procedure,
-- or a manual UPDATE in Workbench): put the seat back on sale and
-- recompute the booking total.
CREATE TRIGGER trg_ticket_after_update
AFTER UPDATE ON ticket
FOR EACH ROW
BEGIN
  IF OLD.ticket_status <> 'cancelled' AND NEW.ticket_status = 'cancelled' THEN
    UPDATE event_seat
       SET availability_status = 'available'
     WHERE event_seat_id = NEW.event_seat_id;

    UPDATE booking
       SET total_amount = (SELECT COALESCE(SUM(t.ticket_price), 0)
                             FROM ticket t
                            WHERE t.booking_id = NEW.booking_id
                              AND t.ticket_status <> 'cancelled')
     WHERE booking_id = NEW.booking_id;
  END IF;
END$$

DELIMITER ;


-- =====================================================================
--  STORED PROCEDURES
-- =====================================================================

DROP PROCEDURE IF EXISTS sp_cancel_ticket;
DROP PROCEDURE IF EXISTS sp_user_booking_history;
DROP PROCEDURE IF EXISTS sp_event_report;

DELIMITER $$

-- Cancel ONE ticket (synopsis: "Cancel a ticket"). Called by the API:
--     CALL sp_cancel_ticket(<ticket_id>, <user_id>);
-- Runs as its own transaction. Row locks (FOR UPDATE) stop two requests
-- cancelling the same ticket twice. trg_ticket_after_update releases the
-- seat and recomputes the total; this procedure then settles the booking
-- and payment status.
CREATE PROCEDURE sp_cancel_ticket(IN p_ticket_id INT, IN p_user_id INT)
BEGIN
  DECLARE v_booking_id  INT;
  DECLARE v_status      VARCHAR(20);
  DECLARE v_event_date  DATE;
  DECLARE v_live_left   INT;

  -- Any error (including our own SIGNALs below) undoes everything.
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

    SELECT t.booking_id, t.ticket_status, e.event_date
      INTO v_booking_id, v_status, v_event_date
      FROM ticket t
      JOIN booking b     ON b.booking_id     = t.booking_id
      JOIN event_seat es ON es.event_seat_id = t.event_seat_id
      JOIN event e       ON e.event_id       = es.event_id
     WHERE t.ticket_id = p_ticket_id
       AND b.user_id   = p_user_id
       FOR UPDATE OF t, b;

    IF v_booking_id IS NULL THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Ticket not found', MYSQL_ERRNO = 50404;
    END IF;
    IF v_status <> 'active' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Only an active ticket can be cancelled', MYSQL_ERRNO = 50409;
    END IF;
    IF v_event_date < CURDATE() THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'This event has already taken place', MYSQL_ERRNO = 50400;
    END IF;

    UPDATE ticket SET ticket_status = 'cancelled' WHERE ticket_id = p_ticket_id;

    SELECT COUNT(*) INTO v_live_left
      FROM ticket
     WHERE booking_id = v_booking_id AND ticket_status <> 'cancelled';

    IF v_live_left = 0 THEN
      UPDATE booking SET booking_status = 'cancelled'          WHERE booking_id = v_booking_id;
      UPDATE payment SET payment_status = 'refunded'           WHERE booking_id = v_booking_id;
    ELSE
      UPDATE payment SET payment_status = 'partially_refunded' WHERE booking_id = v_booking_id;
    END IF;

  COMMIT;
END$$


-- Booking history for one user (synopsis: "View a user's booking history").
CREATE PROCEDURE sp_user_booking_history(IN p_user_id INT)
BEGIN
  SELECT booking_id, booking_date, booking_status, event_name, event_date,
         CONCAT(row_num, seat_number) AS seat, seat_type, ticket_price, ticket_status,
         payment_method, payment_status
    FROM v_booking_details
   WHERE user_id = p_user_id
   ORDER BY booking_date DESC, ticket_id;
END$$


-- Revenue and seat position for one event, in a single result row.
CREATE PROCEDURE sp_event_report(IN p_event_id INT)
BEGIN
  SELECT a.event_id, a.event_name, a.event_date, a.venue_name,
         a.seats_total, a.seats_available, a.seats_booked,
         s.tickets_sold, s.revenue,
         ROUND(100 * a.seats_booked / NULLIF(a.seats_total, 0), 1) AS occupancy_pct
    FROM v_event_availability a
    JOIN v_event_sales s ON s.event_id = a.event_id
   WHERE a.event_id = p_event_id;
END$$

DELIMITER ;
