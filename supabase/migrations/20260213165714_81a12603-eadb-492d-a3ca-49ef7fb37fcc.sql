-- Add barcode column to products
ALTER TABLE public.products ADD COLUMN barcode text DEFAULT NULL;

-- Create index for barcode lookups
CREATE INDEX idx_products_barcode ON public.products (barcode) WHERE barcode IS NOT NULL;