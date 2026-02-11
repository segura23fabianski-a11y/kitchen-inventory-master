
-- Add yield_per_portion to recipe_ingredients (kg produced per portion for this ingredient)
ALTER TABLE public.recipe_ingredients ADD COLUMN yield_per_portion numeric NOT NULL DEFAULT 0;

-- Remove yield_per_portion from recipes (no longer needed at recipe level)
ALTER TABLE public.recipes DROP COLUMN IF EXISTS yield_per_portion;
