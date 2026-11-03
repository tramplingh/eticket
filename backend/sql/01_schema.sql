-- =====================================================================
--  E-TICKET BOOKING PLATFORM  ·  01_schema.sql
--  Creates the database from scratch: 9 relations, every key and
--  constraint 	from the synopsis, plus the indexes the queries rely on.
--
--  Run as root in MySQL Workbench (File > Run SQL Script) or:
--      mysql -u root -p < 01_schema.sql
--  Needs MySQL 8.0.16+ (CHECK constraints are only enforced from 8.0.16).
--
--  WARNING: drops and recreates the eticket_booking database.
--  Next: 02_programmability.sql, then 03_seed.sql.
-- =====================================================================

DROP DATABASE IF EXISTS eticket_booking;
CREATE DATABASE eticket_booking CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE eticket_booking;


-- ---------------------------------------------------------------------
-- USER
--   Composite attribute  Name    -> first_name + last_name
--   Derived attribute    age     -> NOT stored; computed from date_of_birth
--                                   in the view v_user_profile (02 script)
--   Multivalued attr.    phone   -> moved to its own table USER_PHONE (1NF)
-- ---------------------------------------------------------------------
CREATE TABLE `user` (
  user_id        INT           NOT NULL AUTO_INCREMENT,
  first_name     VARCHAR(50)   NOT NULL,
  last_name      VARCHAR(50)   NOT NULL,
  email          VARCHAR(120)  NOT NULL,
  password       VARCHAR(255)  NOT NULL COMMENT 'bcrypt hash; plain text is never stored',
  date_of_birth  DATE          NOT NULL,
  address        VARCHAR(255)  NULL,
  role           ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_user        PRIMARY KEY (user_id),
  CONSTRAINT uq_user_email  UNIQUE (email),
  CONSTRAINT chk_user_email CHECK (email LIKE '%_@_%._%')
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- USER_PHONE  (multivalued attribute, normalised out of USER)
--   Composite primary key: one row per (user, phone) pair.
--   Phones belong to the user, so they are deleted with the user.
-- ---------------------------------------------------------------------
CREATE TABLE user_phone (
  user_id       INT          NOT NULL,
  phone_number  VARCHAR(20)  NOT NULL,
  CONSTRAINT pk_user_phone     PRIMARY KEY (user_id, phone_number),
  CONSTRAINT fk_phone_user     FOREIGN KEY (user_id) REFERENCES `user` (user_id)
                               ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_phone_format  CHECK (REGEXP_LIKE(phone_number, '^[+]?[0-9][0-9 -]{6,18}[0-9]$'))
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- VENUE   (composite attribute Address -> street + city + state)
-- ---------------------------------------------------------------------
CREATE TABLE venue (
  venue_id    INT           NOT NULL AUTO_INCREMENT,
  venue_name  VARCHAR(150)  NOT NULL,
  street      VARCHAR(150)  NULL,
  city        VARCHAR(100)  NOT NULL,
  state       VARCHAR(100)  NOT NULL,
  CONSTRAINT pk_venue            PRIMARY KEY (venue_id),
  CONSTRAINT uq_venue_name_city  UNIQUE (venue_name, city)
) ENGINE = InnoDB;

CREATE INDEX idx_venue_city ON venue (city);


-- ---------------------------------------------------------------------
-- SEAT   (Venue 1 : N Seat)
--   The synopsis calls the row column row_number. ROW_NUMBER is a
--   reserved word in MySQL 8 (window function), so it is row_num here.
-- ---------------------------------------------------------------------
CREATE TABLE seat (
  seat_id      INT          NOT NULL AUTO_INCREMENT,
  venue_id     INT          NOT NULL,
  row_num      VARCHAR(10)  NOT NULL,
  seat_number  VARCHAR(10)  NOT NULL,
  seat_type    VARCHAR(30)  NULL DEFAULT 'Standard',
  CONSTRAINT pk_seat           PRIMARY KEY (seat_id),
  -- a physical seat position exists only once per venue
  CONSTRAINT uq_seat_position  UNIQUE (venue_id, row_num, seat_number),
  CONSTRAINT fk_seat_venue     FOREIGN KEY (venue_id) REFERENCES venue (venue_id)
                               ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- EVENT   (Event N : 1 Venue)
-- ---------------------------------------------------------------------
CREATE TABLE event (
  event_id    INT            NOT NULL AUTO_INCREMENT,
  venue_id    INT            NOT NULL,
  event_name  VARCHAR(150)   NOT NULL,
  event_type  VARCHAR(50)    NULL,
  event_date  DATE           NOT NULL,
  event_time  TIME           NOT NULL,
  base_price  DECIMAL(10,2)  NOT NULL,
  CONSTRAINT pk_event         PRIMARY KEY (event_id),
  -- a venue cannot host two events in the same slot
  CONSTRAINT uq_event_slot    UNIQUE (venue_id, event_date, event_time),
  -- a venue with event history cannot be deleted
  CONSTRAINT fk_event_venue   FOREIGN KEY (venue_id) REFERENCES venue (venue_id)
                              ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_event_price  CHECK (base_price > 0)
  -- "event_date must not be in the past" cannot be a CHECK: CHECK may not
  -- call CURDATE(). trg_event_before_insert enforces it instead (02 script).
) ENGINE = InnoDB;

CREATE INDEX idx_event_date ON event (event_date, event_time);
CREATE INDEX idx_event_type ON event (event_type);


-- ---------------------------------------------------------------------
-- EVENT_SEAT   (associative entity resolving Event M : N Seat)
--   One row = one seat on sale for one event, with its own price and status.
-- ---------------------------------------------------------------------
CREATE TABLE event_seat (
  event_seat_id        INT            NOT NULL AUTO_INCREMENT,
  event_id             INT            NOT NULL,
  seat_id              INT            NOT NULL,
  availability_status  ENUM('available','locked','booked') NOT NULL DEFAULT 'available',
  price                DECIMAL(10,2)  NOT NULL,
  CONSTRAINT pk_event_seat   PRIMARY KEY (event_seat_id),
  -- the same seat cannot be put on sale twice for one event
  CONSTRAINT uq_event_seat   UNIQUE (event_id, seat_id),
  CONSTRAINT fk_es_event     FOREIGN KEY (event_id) REFERENCES event (event_id)
                             ON DELETE CASCADE,
  CONSTRAINT fk_es_seat      FOREIGN KEY (seat_id) REFERENCES seat (seat_id)
                             ON DELETE RESTRICT,
  CONSTRAINT chk_es_price    CHECK (price >= 0)
) ENGINE = InnoDB;

-- "available seats for event X" is the hottest query in the app
CREATE INDEX idx_es_event_status ON event_seat (event_id, availability_status);


-- ---------------------------------------------------------------------
-- BOOKING   (User 1 : N Booking)
--   total_amount is a DERIVED attribute (sum of its live ticket prices).
--   It is stored for fast reads and kept correct by trg_ticket_after_insert
--   and trg_ticket_after_update (02 script).
-- ---------------------------------------------------------------------
CREATE TABLE booking (
  booking_id      INT            NOT NULL AUTO_INCREMENT,
  user_id         INT            NOT NULL,
  booking_date    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  booking_status  ENUM('pending','confirmed','cancelled') NOT NULL DEFAULT 'pending',
  total_amount    DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  CONSTRAINT pk_booking        PRIMARY KEY (booking_id),
  -- financial history: a user with bookings cannot be deleted
  CONSTRAINT fk_booking_user   FOREIGN KEY (user_id) REFERENCES `user` (user_id)
                               ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_booking_total CHECK (total_amount >= 0)
) ENGINE = InnoDB;

CREATE INDEX idx_booking_user ON booking (user_id, booking_date);
CREATE INDEX idx_booking_date ON booking (booking_date);


-- ---------------------------------------------------------------------
-- TICKET   (Booking 1 : N Ticket,  Ticket N : 1 Event_Seat)
--   Many tickets may point at the same event_seat over time (a cancelled
--   ticket keeps its row; the seat is resold to someone else), but only
--   ONE may be live at a time. MySQL has no partial unique index, so a
--   stored generated column does the job: it holds event_seat_id for live
--   tickets and NULL for cancelled ones, and a UNIQUE index ignores NULLs.
-- ---------------------------------------------------------------------
CREATE TABLE ticket (
  ticket_id      INT            NOT NULL AUTO_INCREMENT,
  booking_id     INT            NOT NULL,
  event_seat_id  INT            NOT NULL,
  ticket_price   DECIMAL(10,2)  NOT NULL,
  ticket_status  ENUM('active','cancelled','used') NOT NULL DEFAULT 'active',
  qr_code        VARCHAR(255)   NULL,
  live_seat_id   INT GENERATED ALWAYS AS (IF(ticket_status = 'cancelled', NULL, event_seat_id)) STORED,
  CONSTRAINT pk_ticket            PRIMARY KEY (ticket_id),
  CONSTRAINT uq_ticket_qr         UNIQUE (qr_code),
  CONSTRAINT uq_ticket_live_seat  UNIQUE (live_seat_id),
  CONSTRAINT fk_ticket_booking    FOREIGN KEY (booking_id) REFERENCES booking (booking_id)
                                  ON DELETE RESTRICT,
  CONSTRAINT fk_ticket_es         FOREIGN KEY (event_seat_id) REFERENCES event_seat (event_seat_id)
                                  ON DELETE RESTRICT,
  CONSTRAINT chk_ticket_price     CHECK (ticket_price >= 0)
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- PAYMENT   (Booking 1 : 1 Payment — the UNIQUE on booking_id is what
--            turns an ordinary 1:N foreign key into 1:1)
--   amount = what was charged at checkout. Refunded so far is derived:
--   amount - booking.total_amount.
-- ---------------------------------------------------------------------
CREATE TABLE payment (
  payment_id      INT            NOT NULL AUTO_INCREMENT,
  booking_id      INT            NOT NULL,
  amount          DECIMAL(10,2)  NOT NULL,
  payment_method  VARCHAR(30)    NOT NULL,
  payment_status  ENUM('pending','completed','failed','refunded','partially_refunded') NOT NULL DEFAULT 'pending',
  payment_date    DATETIME       NULL,
  transaction_id  VARCHAR(100)   NULL,
  CONSTRAINT pk_payment          PRIMARY KEY (payment_id),
  CONSTRAINT uq_payment_booking  UNIQUE (booking_id),
  CONSTRAINT uq_payment_txn      UNIQUE (transaction_id),
  CONSTRAINT fk_payment_booking  FOREIGN KEY (booking_id) REFERENCES booking (booking_id)
                                 ON DELETE RESTRICT,
  CONSTRAINT chk_payment_amount  CHECK (amount >= 0),
  CONSTRAINT chk_payment_method  CHECK (payment_method IN ('card','upi','netbanking','wallet'))
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- Application account (least privilege: data rights + EXECUTE for the
-- stored procedure; no DROP/ALTER). If eticket_app already exists, its
-- password is left unchanged and it simply gains the grants below.
-- If it is new, set this same password in backend/.env.
-- ---------------------------------------------------------------------
CREATE USER IF NOT EXISTS 'eticket_app'@'localhost' IDENTIFIED BY 'ChangeMe#2026';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON eticket_booking.* TO 'eticket_app'@'localhost';
