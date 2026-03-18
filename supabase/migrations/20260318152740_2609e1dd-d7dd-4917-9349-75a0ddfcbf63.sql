
-- Many-to-many: recipes ↔ meal_components (tagging recipes with component types)
CREATE TABLE public.recipe_component_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.meal_components(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(recipe_id, component_id)
);

ALTER TABLE public.recipe_component_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view recipe_component_tags"
  ON public.recipe_component_tags FOR SELECT
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage recipe_component_tags"
  ON public.recipe_component_tags FOR ALL
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());
