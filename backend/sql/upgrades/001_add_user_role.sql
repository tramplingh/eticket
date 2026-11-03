-- Run once (as root or another account with ALTER rights) to add admin support.
USE eticket_booking;

ALTER TABLE `user`
  ADD COLUMN `role` ENUM('user', 'admin') NOT NULL DEFAULT 'user' AFTER `address`;

-- Make sure the app account can manage events/venues/seats (skip if it already has full DML rights):
-- GRANT SELECT, INSERT, UPDATE, DELETE ON eticket_booking.* TO 'eticket_app'@'localhost';
-- FLUSH PRIVILEGES;
