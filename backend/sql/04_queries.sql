-- =====================================================================
--  E-TICKET BOOKING PLATFORM  ·  04_queries.sql
--  The 14 "Expected Database Operations" from the synopsis, in order,
--  as standalone SQL you can run in MySQL Workbench against the seed data.
--
--  Re-runnable: every statement that writes data runs inside
--  START TRANSACTION ... ROLLBACK, so running this file changes nothing.
--  Parameters are session variables (@...) so you can edit them at the top
--  of each block, the same way the API passes %s parameters.
-- =====================================================================

USE eticket_booking;


-- ---------------------------------------------------------------------
-- 1. Register a new user
--    Two tables: the user row, then the multivalued phone numbers.
-- ---------------------------------------------------------------------
START TRANSACTION;

INSERT INTO `user` (first_name, last_name, email, password, date_of_birth, address)
VALUES ('Meera', 'Pillai', 'meera.pillai@example.com',
        '$2b$12$QImHDdYzWe6/lK/cGE16GemRhDACx4DQ9CC5GCr9FmTjGzP/.tC3G',
        '2000-06-05', 'Malleshwaram, Bengaluru');
SET @new_user = LAST_INSERT_ID();

INSERT INTO user_phone (user_id, phone_number) VALUES
  (@new_user, '+91 98860 10101'),
  (@new_user, '+91 80 2334 5566');

SELECT * FROM v_user_profile WHERE user_id = @new_user;   -- age is derived

ROLLBACK;


-- ---------------------------------------------------------------------
-- 2. Display available events
--    Upcoming, with at least one seat still on sale.
-- ---------------------------------------------------------------------
SELECT event_id, event_name, event_type, event_date, event_time,
       venue_name, city, seats_available, seats_total
  FROM v_event_availability
 WHERE event_date >= CURDATE()
   AND seats_available > 0
 ORDER BY event_date, event_time;


-- ---------------------------------------------------------------------
-- 3. Display events at a particular venue
-- ---------------------------------------------------------------------
SET @venue_id = 1;

SELECT e.event_id, e.event_name, e.event_type, e.event_date, e.event_time, e.base_price,
       v.venue_name, v.city
  FROM event e
  JOIN venue v ON v.venue_id = e.venue_id
 WHERE e.venue_id = @venue_id
 ORDER BY e.event_date, e.event_time;


-- ---------------------------------------------------------------------
-- 4. Display available seats for an event
-- ---------------------------------------------------------------------
SET @event_id = 2;

SELECT es.event_seat_id,
       CONCAT(s.row_num, s.seat_number) AS seat,
       s.seat_type,
       es.price
  FROM event_seat es
  JOIN seat s ON s.seat_id = es.seat_id
 WHERE es.event_id = @event_id
   AND es.availability_status = 'available'
 ORDER BY s.row_num, CAST(s.seat_number AS UNSIGNED);


-- ---------------------------------------------------------------------
-- 5, 6, 7.  Create a new booking  ->  Generate its tickets  ->
--           Record the payment
--    One transaction, exactly as POST /bookings does it. FOR UPDATE locks
--    the chosen seats so a second buyer waits, then sees them as booked.
-- ---------------------------------------------------------------------
SET @customer = 6;          -- Fatima Khan
SET @event_id = 10;         -- Bharatanatyam Margam Recital
SET @row      = 'C';

START TRANSACTION;

  -- lock the seats being bought (row C, seats 5-7)
  SELECT es.event_seat_id, es.availability_status, es.price
    FROM event_seat es
    JOIN seat s ON s.seat_id = es.seat_id
   WHERE es.event_id = @event_id AND s.row_num = @row
     AND CAST(s.seat_number AS UNSIGNED) BETWEEN 5 AND 7
   FOR UPDATE;

  -- 5. the booking (total_amount is filled in by trg_ticket_after_insert)
  INSERT INTO booking (user_id, booking_status) VALUES (@customer, 'confirmed');
  SET @booking_id = LAST_INSERT_ID();

  -- 6. one ticket per seat, each with a unique QR code
  INSERT INTO ticket (booking_id, event_seat_id, ticket_price, ticket_status, qr_code)
  SELECT @booking_id, es.event_seat_id, es.price, 'active', UUID()
    FROM event_seat es
    JOIN seat s ON s.seat_id = es.seat_id
   WHERE es.event_id = @event_id AND s.row_num = @row
     AND CAST(s.seat_number AS UNSIGNED) BETWEEN 5 AND 7
     AND es.availability_status = 'available';

  UPDATE event_seat es
    JOIN ticket t ON t.event_seat_id = es.event_seat_id
     SET es.availability_status = 'booked'
   WHERE t.booking_id = @booking_id;

  -- 7. the payment, for exactly the derived total
  INSERT INTO payment (booking_id, amount, payment_method, payment_status, payment_date, transaction_id)
  SELECT booking_id, total_amount, 'upi', 'completed', NOW(), UUID()
    FROM booking WHERE booking_id = @booking_id;

  SELECT * FROM v_booking_details WHERE booking_id = @booking_id;

ROLLBACK;


-- ---------------------------------------------------------------------
-- 8. Cancel a ticket
--    The app calls the stored procedure:
--        CALL sp_cancel_ticket(<ticket_id>, <user_id>);
--    It is not run here because it commits. The block below shows what
--    the trigger does when a ticket is cancelled, then rolls it back.
-- ---------------------------------------------------------------------
SET @ticket_id = (SELECT MIN(ticket_id) FROM ticket WHERE booking_id = 1 AND ticket_status = 'active');

START TRANSACTION;

  SELECT 'before' AS stage, t.ticket_status, es.availability_status, b.total_amount
    FROM ticket t JOIN event_seat es USING (event_seat_id) JOIN booking b USING (booking_id)
   WHERE t.ticket_id = @ticket_id;

  UPDATE ticket SET ticket_status = 'cancelled' WHERE ticket_id = @ticket_id;
  -- trg_ticket_after_update has now freed the seat and reduced the total

  SELECT 'after' AS stage, t.ticket_status, es.availability_status, b.total_amount
    FROM ticket t JOIN event_seat es USING (event_seat_id) JOIN booking b USING (booking_id)
   WHERE t.ticket_id = @ticket_id;

ROLLBACK;


-- ---------------------------------------------------------------------
-- 9. View a user's booking history
-- ---------------------------------------------------------------------
SET @user_id = 2;           -- Priya Sharma

SELECT b.booking_id, b.booking_date, b.booking_status, b.total_amount,
       e.event_name, e.event_date,
       COUNT(t.ticket_id)                                   AS tickets,
       GROUP_CONCAT(CONCAT(s.row_num, s.seat_number)
                    ORDER BY s.row_num, CAST(s.seat_number AS UNSIGNED)) AS seats,
       p.payment_method, p.payment_status
  FROM booking b
  JOIN ticket t      ON t.booking_id     = b.booking_id
  JOIN event_seat es ON es.event_seat_id = t.event_seat_id
  JOIN event e       ON e.event_id       = es.event_id
  JOIN seat s        ON s.seat_id        = es.seat_id
  LEFT JOIN payment p ON p.booking_id    = b.booking_id
 WHERE b.user_id = @user_id
 GROUP BY b.booking_id, b.booking_date, b.booking_status, b.total_amount,
          e.event_name, e.event_date, p.payment_method, p.payment_status
 ORDER BY b.booking_date DESC;

-- Same thing, ticket by ticket, through the stored procedure:
CALL sp_user_booking_history(@user_id);


-- ---------------------------------------------------------------------
-- 10. Calculate total revenue generated by an event
-- ---------------------------------------------------------------------
SET @event_id = 2;

SELECT e.event_id, e.event_name,
       COUNT(t.ticket_id)               AS tickets_sold,
       COALESCE(SUM(t.ticket_price), 0) AS total_revenue
  FROM event e
  LEFT JOIN event_seat es ON es.event_id = e.event_id
  LEFT JOIN ticket t      ON t.event_seat_id = es.event_seat_id
                         AND t.ticket_status <> 'cancelled'
 WHERE e.event_id = @event_id
 GROUP BY e.event_id, e.event_name;

-- Every event at once, with the share of total revenue (window function):
SELECT event_id, event_name, tickets_sold, revenue,
       ROUND(100 * revenue / SUM(revenue) OVER (), 1) AS pct_of_all_revenue
  FROM v_event_sales
 ORDER BY revenue DESC;


-- ---------------------------------------------------------------------
-- 11. Find the most frequently booked events
-- ---------------------------------------------------------------------
SELECT e.event_id, e.event_name,
       COUNT(DISTINCT t.booking_id) AS bookings,
       COUNT(t.ticket_id)           AS tickets_sold
  FROM event e
  JOIN event_seat es ON es.event_id = e.event_id
  JOIN ticket t      ON t.event_seat_id = es.event_seat_id
 WHERE t.ticket_status <> 'cancelled'
 GROUP BY e.event_id, e.event_name
 ORDER BY tickets_sold DESC, bookings DESC
 LIMIT 5;


-- ---------------------------------------------------------------------
-- 12. Find the number of available and booked seats
--     Conditional aggregation: one pass over event_seat, one row per event.
-- ---------------------------------------------------------------------
SELECT e.event_id, e.event_name,
       SUM(es.availability_status = 'available') AS available,
       SUM(es.availability_status = 'booked')    AS booked,
       SUM(es.availability_status = 'locked')    AS held,
       COUNT(*)                                  AS total
  FROM event e
  JOIN event_seat es ON es.event_id = e.event_id
 GROUP BY e.event_id, e.event_name
 ORDER BY e.event_id;


-- ---------------------------------------------------------------------
-- 13. Display all bookings for a particular date
--     Half-open range instead of DATE(booking_date) = @d, so the index
--     idx_booking_date can still be used (a function on the column would
--     hide it from the optimiser).
-- ---------------------------------------------------------------------
SET @booking_day = CURDATE();

SELECT b.booking_id, b.booking_date, b.booking_status, b.total_amount,
       CONCAT(u.first_name, ' ', u.last_name) AS customer
  FROM booking b
  JOIN `user` u ON u.user_id = b.user_id
 WHERE b.booking_date >= @booking_day
   AND b.booking_date <  @booking_day + INTERVAL 1 DAY
 ORDER BY b.booking_date;

-- Proof that the index is used:
EXPLAIN
SELECT booking_id FROM booking
 WHERE booking_date >= @booking_day AND booking_date < @booking_day + INTERVAL 1 DAY;


-- ---------------------------------------------------------------------
-- 14. Search events based on type, date or venue
--     Any filter left NULL is ignored, so one query serves every combination.
-- ---------------------------------------------------------------------
SET @type  = 'Concert';
SET @date  = NULL;          -- e.g. CURDATE() + INTERVAL 7 DAY
SET @venue = NULL;          -- e.g. 3
SET @text  = NULL;          -- e.g. 'jazz'

SELECT e.event_id, e.event_name, e.event_type, e.event_date, e.event_time,
       v.venue_name, v.city, e.base_price
  FROM event e
  JOIN venue v ON v.venue_id = e.venue_id
 WHERE (@type  IS NULL OR e.event_type = @type)
   AND (@date  IS NULL OR e.event_date = @date)
   AND (@venue IS NULL OR e.venue_id   = @venue)
   AND (@text  IS NULL OR e.event_name LIKE CONCAT('%', @text, '%'))
 ORDER BY e.event_date, e.event_time;


-- =====================================================================
--  EXTRA: queries that show the attribute types from the synopsis
-- =====================================================================

-- Derived attribute (age) and multivalued attribute (phones) side by side
SELECT p.user_id, p.full_name, p.date_of_birth, p.age,
       GROUP_CONCAT(ph.phone_number ORDER BY ph.phone_number SEPARATOR ', ') AS phones
  FROM v_user_profile p
  LEFT JOIN user_phone ph ON ph.user_id = p.user_id
 GROUP BY p.user_id, p.full_name, p.date_of_birth, p.age
 ORDER BY p.user_id;

-- Derived attribute (booking total) checked against its source data:
-- this should return zero rows.
SELECT b.booking_id, b.total_amount,
       COALESCE(SUM(CASE WHEN t.ticket_status <> 'cancelled' THEN t.ticket_price END), 0) AS recomputed
  FROM booking b
  LEFT JOIN ticket t ON t.booking_id = b.booking_id
 GROUP BY b.booking_id, b.total_amount
HAVING b.total_amount <> recomputed;

-- 1:1 Booking-Payment and refunds: what was paid vs what is still live
SELECT b.booking_id, b.booking_status, p.payment_status,
       p.amount                    AS paid,
       b.total_amount              AS still_live,
       p.amount - b.total_amount   AS refunded
  FROM booking b
  JOIN payment p ON p.booking_id = b.booking_id
 WHERE p.payment_status IN ('refunded', 'partially_refunded');

-- One event's full report from the stored procedure
CALL sp_event_report(2);
