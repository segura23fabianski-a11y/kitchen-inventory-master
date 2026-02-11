
-- Add recipe_id to inventory_movements to link consumption to recipes
ALTER TABLE public.inventory_movements
  ADD COLUMN recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL;

CREATE INDEX idx_movements_recipe ON public.inventory_movements(recipe_id);
