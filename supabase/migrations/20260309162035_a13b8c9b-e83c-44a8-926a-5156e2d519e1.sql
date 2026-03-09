
ALTER TABLE public.products
  ADD COLUMN daily_consumption NUMERIC NULL,
  ADD COLUMN target_days_of_stock NUMERIC NOT NULL DEFAULT 5,
  ADD COLUMN reorder_mode TEXT NOT NULL DEFAULT 'min_stock' CHECK (reorder_mode IN ('min_stock','coverage'));
