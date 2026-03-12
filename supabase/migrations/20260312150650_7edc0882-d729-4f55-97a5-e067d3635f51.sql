
ALTER TABLE public.menu_items 
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'simple',
  ADD COLUMN IF NOT EXISTS linked_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.menu_items.item_type IS 'simple | direct_product | recipe | combo_variable';
COMMENT ON COLUMN public.menu_items.linked_product_id IS 'FK to products table for direct_product items';
