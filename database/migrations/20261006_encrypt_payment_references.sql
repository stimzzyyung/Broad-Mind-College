ALTER TABLE payments
  MODIFY COLUMN reference VARCHAR(100) NULL,
  ADD COLUMN encrypted_reference VARCHAR(255) NULL AFTER reference;
