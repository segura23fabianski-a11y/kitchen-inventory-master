
-- Add billing_mode and guest_id to pos_orders for individual billing tracking
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'corporate_charge',
  ADD COLUMN IF NOT EXISTS guest_id uuid REFERENCES public.hotel_guests(id) ON DELETE SET NULL;

-- Add index for guest-based queries (accounts receivable reports)
CREATE INDEX IF NOT EXISTS idx_pos_orders_guest_id ON public.pos_orders(guest_id);
CREATE INDEX IF NOT EXISTS idx_pos_orders_billing_mode ON public.pos_orders(billing_mode);
