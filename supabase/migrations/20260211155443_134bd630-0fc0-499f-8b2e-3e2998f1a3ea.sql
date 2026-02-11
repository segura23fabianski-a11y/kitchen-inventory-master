
-- Add unit column to recipe_ingredients for conversion support
ALTER TABLE public.recipe_ingredients
ADD COLUMN unit text NOT NULL DEFAULT 'unidad';
