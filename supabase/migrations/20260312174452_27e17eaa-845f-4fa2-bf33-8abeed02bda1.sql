
-- 1. Add 'active' column to products table with default true
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- 2. Create composite index on inventory_movements for Kardex performance
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_date 
ON public.inventory_movements (product_id, movement_date);
