BEGIN;
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS razorpay_signature VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_razorpay_order
  ON payments(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_razorpay_payment
  ON payments(razorpay_payment_id) WHERE razorpay_payment_id IS NOT NULL;
COMMIT;
