ALTER TABLE payments
  ADD COLUMN decline_reason VARCHAR(100) NULL AFTER status;
