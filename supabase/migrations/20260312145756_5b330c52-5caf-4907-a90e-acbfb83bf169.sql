
-- Add barcode to menu_items for POS barcode scanning
ALTER TABLE public.menu_items ADD COLUMN IF NOT EXISTS barcode TEXT;
CREATE INDEX IF NOT EXISTS idx_menu_items_barcode ON public.menu_items (barcode) WHERE barcode IS NOT NULL;

-- Add is_test_record flag to pos_orders for test data cleanup
ALTER TABLE public.pos_orders ADD COLUMN IF NOT EXISTS is_test_record BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_pos_orders_test ON public.pos_orders (is_test_record) WHERE is_test_record = true;
