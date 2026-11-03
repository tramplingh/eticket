-- =====================================================================
--  E-TICKET BOOKING PLATFORM  ·  03_seed.sql
--  Sample data for the demo. Run after 01_schema.sql and
--  02_programmability.sql, on an empty database.
--
--  Event dates are relative to the day you run this (CURDATE() + n), so
--  the demo always has upcoming events no matter when it is loaded.
--
--  Logins created:
--    admin@eticket.com          / Admin@123      (admin)
--    priya.sharma@example.com   / Password@123   (customer; all customers
--    rahul.verma@example.com      share this password)
--    ananya.iyer@example.com
--    karthik.reddy@example.com
--    fatima.khan@example.com
--    arjun.nair@example.com
-- =====================================================================

USE eticket_booking;


-- ---------------------------------------------------------------------
-- Seed-only helper procedures (dropped at the end of this script)
-- ---------------------------------------------------------------------
DROP PROCEDURE IF EXISTS seed_seat_block;
DROP PROCEDURE IF EXISTS seed_booking;

DELIMITER $$

-- Adds rows p_first..p_last (single letters) with p_per_row seats each.
CREATE PROCEDURE seed_seat_block(IN p_venue INT, IN p_first CHAR(1), IN p_last CHAR(1),
                                 IN p_per_row INT, IN p_type VARCHAR(30))
BEGIN
  DECLARE v_row INT DEFAULT ASCII(p_first);
  DECLARE v_num INT;
  WHILE v_row <= ASCII(p_last) DO
    SET v_num = 1;
    WHILE v_num <= p_per_row DO
      INSERT INTO seat (venue_id, row_num, seat_number, seat_type)
      VALUES (p_venue, CHAR(v_row), CAST(v_num AS CHAR), p_type);
      SET v_num = v_num + 1;
    END WHILE;
    SET v_row = v_row + 1;
  END WHILE;
END$$

-- Books seats p_from..p_to in one row of one event, exactly the way the
-- API does it: booking -> tickets -> seats marked booked -> payment.
-- booking.total_amount is filled in by trg_ticket_after_insert.
CREATE PROCEDURE seed_booking(IN p_user INT, IN p_event INT, IN p_row VARCHAR(10),
                              IN p_from INT, IN p_to INT,
                              IN p_method VARCHAR(30), IN p_hours_ago INT)
BEGIN
  DECLARE v_booking INT;

  INSERT INTO booking (user_id, booking_date, booking_status, total_amount)
  VALUES (p_user, NOW() - INTERVAL p_hours_ago HOUR, 'confirmed', 0);
  SET v_booking = LAST_INSERT_ID();

  INSERT INTO ticket (booking_id, event_seat_id, ticket_price, ticket_status, qr_code)
  SELECT v_booking, es.event_seat_id, es.price, 'active', UUID()
    FROM event_seat es
    JOIN seat s ON s.seat_id = es.seat_id
   WHERE es.event_id = p_event
     AND s.row_num   = p_row
     AND CAST(s.seat_number AS UNSIGNED) BETWEEN p_from AND p_to
     AND es.availability_status = 'available'
   ORDER BY es.event_seat_id;

  UPDATE event_seat es
    JOIN ticket t ON t.event_seat_id = es.event_seat_id
     SET es.availability_status = 'booked'
   WHERE t.booking_id = v_booking;

  INSERT INTO payment (booking_id, amount, payment_method, payment_status, payment_date, transaction_id)
  SELECT booking_id, total_amount, p_method, 'completed', booking_date, UUID()
    FROM booking WHERE booking_id = v_booking;

  SET @last_booking = v_booking;
END$$

DELIMITER ;


-- ---------------------------------------------------------------------
-- USERS  (passwords are bcrypt hashes)
-- ---------------------------------------------------------------------
INSERT INTO `user` (user_id, first_name, last_name, email, password, date_of_birth, address, role) VALUES
 (1, 'Site',    'Admin',  'admin@eticket.com',         '$2b$12$Gv1TKuheHAKtd7HtXoGpR.C0T.//M4jZEeBnFa1HBgnqTCW5sj2dK', '1990-01-01', NULL, 'admin'),
 (2, 'Priya',   'Sharma', 'priya.sharma@example.com',  '$2b$12$QImHDdYzWe6/lK/cGE16GemRhDACx4DQ9CC5GCr9FmTjGzP/.tC3G', '1998-04-12', '12th Main, Indiranagar, Bengaluru', 'user'),
 (3, 'Rahul',   'Verma',  'rahul.verma@example.com',   '$2b$12$QImHDdYzWe6/lK/cGE16GemRhDACx4DQ9CC5GCr9FmTjGzP/.tC3G', '1995-09-30', 'Lokhandwala, Andheri West, Mumbai', 'user'),
 (4, 'Ananya',  'Iyer',   'ananya.iyer@example.com',   '$2b$12$QImHDdYzWe6/lK/cGE16GemRhDACx4DQ9CC5GCr9FmTjGzP/.tC3G', '2001-01-22', '4th Block, Jayanagar, Bengaluru', 'user'),
 (5, 'Karthik', 'Reddy',  'karthik.reddy@example.com', '$2b$12$QImHDdYzWe6/lK/cGE16GemRhDACx4DQ9CC5GCr9FmTjGzP/.tC3G', '1992-07-08', 'Gachibowli, Hyderabad', 'user'),
 (6, 'Fatima',  'Khan',   'fatima.khan@example.com',   '$2b$12$QImHDdYzWe6/lK/cGE16GemRhDACx4DQ9CC5GCr9FmTjGzP/.tC3G', '1999-11-17', 'Saket, New Delhi', 'user'),
 (7, 'Arjun',   'Nair',   'arjun.nair@example.com',    '$2b$12$QImHDdYzWe6/lK/cGE16GemRhDACx4DQ9CC5GCr9FmTjGzP/.tC3G', '2003-03-15', 'Koramangala, Bengaluru', 'user');

-- Multivalued attribute: some users have two numbers, one has none.
INSERT INTO user_phone (user_id, phone_number) VALUES
 (2, '+91 98450 12345'),
 (2, '+91 80 4123 4567'),
 (3, '+91 99200 54321'),
 (4, '+91 97400 11223'),
 (4, '+91 96320 44556'),
 (5, '+91 90000 77889'),
 (6, '+91 98110 33445');


-- ---------------------------------------------------------------------
-- VENUES and SEATS
-- ---------------------------------------------------------------------
INSERT INTO venue (venue_id, venue_name, street, city, state) VALUES
 (1, 'Chowdiah Memorial Hall', '16th Cross Road, Vasanth Nagar', 'Bengaluru', 'Karnataka'),
 (2, 'Jagriti Theatre',        'Varthur Road, Whitefield',        'Bengaluru', 'Karnataka'),
 (3, 'Shanmukhananda Hall',    'Sion East',                       'Mumbai',    'Maharashtra'),
 (4, 'Siri Fort Auditorium',   'August Kranti Marg',              'New Delhi', 'Delhi');

CALL seed_seat_block(1, 'A', 'B', 14, 'VIP');        -- Chowdiah: 140 seats
CALL seed_seat_block(1, 'C', 'E', 14, 'Premium');
CALL seed_seat_block(1, 'F', 'J', 14, 'Standard');
CALL seed_seat_block(2, 'A', 'C', 10, 'Premium');    -- Jagriti: 80 seats
CALL seed_seat_block(2, 'D', 'H', 10, 'Standard');
CALL seed_seat_block(3, 'A', 'B', 16, 'VIP');        -- Shanmukhananda: 192 seats
CALL seed_seat_block(3, 'C', 'F', 16, 'Premium');
CALL seed_seat_block(3, 'G', 'L', 16, 'Standard');
CALL seed_seat_block(4, 'A', 'C', 12, 'Premium');    -- Siri Fort: 96 seats
CALL seed_seat_block(4, 'D', 'H', 12, 'Standard');


-- ---------------------------------------------------------------------
-- EVENTS  (dates relative to today)
-- ---------------------------------------------------------------------
INSERT INTO event (event_id, venue_id, event_name, event_type, event_date, event_time, base_price) VALUES
 ( 1, 1, 'Monsoon Ragas: A Carnatic Evening',     'Concert', CURDATE() + INTERVAL  5 DAY, '18:30:00',  800.00),
 ( 2, 2, 'Laugh Riot: Tales from the Tech Park',  'Comedy',  CURDATE() + INTERVAL  3 DAY, '20:00:00',  500.00),
 ( 3, 2, 'Hamlet, Retold',                        'Theatre', CURDATE() + INTERVAL 12 DAY, '19:30:00',  600.00),
 ( 4, 1, 'Bengaluru Jazz Collective Live',        'Concert', CURDATE() + INTERVAL 18 DAY, '19:00:00', 1000.00),
 ( 5, 4, 'Kathak: Rhythms of the Court',          'Dance',   CURDATE() + INTERVAL  9 DAY, '18:00:00',  700.00),
 ( 6, 3, 'Sufi Nights by the Sea',                'Concert', CURDATE() + INTERVAL  7 DAY, '19:30:00',  900.00),
 ( 7, 3, 'Open Mic Comedy Marathon',              'Comedy',  CURDATE() + INTERVAL 21 DAY, '20:30:00',  400.00),
 ( 8, 4, 'The Magic Lantern: Family Magic Show',  'Family',  CURDATE() + INTERVAL 15 DAY, '11:00:00',  350.00),
 ( 9, 4, 'Indie Rock Showcase',                   'Concert', CURDATE() + INTERVAL 30 DAY, '19:00:00',  750.00),
 (10, 1, 'Bharatanatyam Margam Recital',          'Dance',   CURDATE() + INTERVAL 40 DAY, '18:00:00',  650.00);

-- Seat inventory for every event in one statement (INSERT ... SELECT),
-- priced by seat type: VIP 2.5x, Premium 1.5x, Standard 1x base price.
INSERT INTO event_seat (event_id, seat_id, availability_status, price)
SELECT e.event_id,
       s.seat_id,
       'available',
       CASE s.seat_type
         WHEN 'VIP'     THEN e.base_price * 2.5
         WHEN 'Premium' THEN e.base_price * 1.5
         ELSE e.base_price
       END
  FROM event e
  JOIN seat s ON s.venue_id = e.venue_id
 ORDER BY e.event_id, s.seat_id;


-- ---------------------------------------------------------------------
-- BOOKINGS  (user, event, row, from seat, to seat, method, hours ago)
-- ---------------------------------------------------------------------

-- "Laugh Riot" is nearly sold out: rows A-G gone, 10 of 80 seats left.
CALL seed_booking(2, 2, 'A', 1, 10, 'card',       230);
CALL seed_booking(3, 2, 'B', 1, 10, 'upi',        200);
CALL seed_booking(4, 2, 'C', 1, 10, 'upi',        170);
CALL seed_booking(5, 2, 'D', 1, 10, 'netbanking', 150);
CALL seed_booking(6, 2, 'E', 1, 10, 'wallet',     120);
CALL seed_booking(7, 2, 'F', 1, 10, 'card',       100);
CALL seed_booking(4, 2, 'G', 1, 10, 'upi',         75);

CALL seed_booking(5, 8, 'D', 1,  4, 'upi',         50);
CALL seed_booking(2, 1, 'C', 6,  8, 'upi',         50);
SET @partial_booking = @last_booking;
CALL seed_booking(6, 9, 'E', 5,  8, 'card',        75);
CALL seed_booking(2, 6, 'A', 7,  8, 'card',        30);
CALL seed_booking(3, 6, 'G', 1,  4, 'card',        26);
CALL seed_booking(7, 3, 'B', 4,  5, 'upi',         26);
SET @cancelled_booking = @last_booking;
CALL seed_booking(3, 4, 'A', 5,  6, 'netbanking',   5);
CALL seed_booking(5, 1, 'A', 3,  4, 'card',         3);
CALL seed_booking(4, 5, 'D', 5,  7, 'upi',          2);
CALL seed_booking(6, 7, 'C', 9, 12, 'wallet',       1);


-- ---------------------------------------------------------------------
-- CANCELLATIONS, through the real stored procedure
-- ---------------------------------------------------------------------

-- Priya cancels one of her three Monsoon Ragas tickets -> partially refunded.
SELECT MAX(ticket_id) INTO @t FROM ticket WHERE booking_id = @partial_booking;
CALL sp_cancel_ticket(@t, 2);

-- Arjun cancels both Hamlet tickets -> booking cancelled, fully refunded.
SELECT MIN(ticket_id) INTO @t FROM ticket WHERE booking_id = @cancelled_booking AND ticket_status = 'active';
CALL sp_cancel_ticket(@t, 7);
SELECT MIN(ticket_id) INTO @t FROM ticket WHERE booking_id = @cancelled_booking AND ticket_status = 'active';
CALL sp_cancel_ticket(@t, 7);


-- ---------------------------------------------------------------------
-- Clean up the seed-only helpers
-- ---------------------------------------------------------------------
DROP PROCEDURE seed_seat_block;
DROP PROCEDURE seed_booking;

-- Quick sanity summary
SELECT (SELECT COUNT(*) FROM `user`)     AS users,
       (SELECT COUNT(*) FROM venue)      AS venues,
       (SELECT COUNT(*) FROM seat)       AS seats,
       (SELECT COUNT(*) FROM event)      AS events,
       (SELECT COUNT(*) FROM event_seat) AS event_seats,
       (SELECT COUNT(*) FROM booking)    AS bookings,
       (SELECT COUNT(*) FROM ticket)     AS tickets,
       (SELECT COUNT(*) FROM payment)    AS payments;
