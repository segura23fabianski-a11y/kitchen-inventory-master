
-- Add recipe_mode to recipes table
ALTER TABLE public.recipes ADD COLUMN recipe_mode text NOT NULL DEFAULT 'fixed';

-- Create recipe_variable_components table
CREATE TABLE public.recipe_variable_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  component_name text NOT NULL,
  quantity_per_service numeric NOT NULL DEFAULT 1,
  required boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.recipe_variable_components ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenant users can view recipe_variable_components"
  ON public.recipe_variable_components FOR SELECT
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage recipe_variable_components"
  ON public.recipe_variable_components FOR ALL
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Index for fast lookups
CREATE INDEX idx_recipe_variable_components_recipe ON public.recipe_variable_components(recipe_id);
