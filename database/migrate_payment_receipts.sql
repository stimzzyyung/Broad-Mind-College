-- Migration: Add uploaded receipt and caption support to payments
USE `broad-mind-private-school`;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS receipt_file VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS receipt_mime VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS receipt_original_name VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS caption TEXT NULL;
