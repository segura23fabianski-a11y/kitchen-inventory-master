
-- Allow bodega to manage categories
CREATE POLICY "Bodega can manage categories"
ON public.categories
FOR ALL
USING (has_role(auth.uid(), 'bodega'::app_role));

-- Allow bodega to manage recipes
CREATE POLICY "Bodega can manage recipes"
ON public.recipes
FOR ALL
USING (has_role(auth.uid(), 'bodega'::app_role));

-- Allow bodega to manage recipe ingredients
CREATE POLICY "Bodega can manage recipe ingredients"
ON public.recipe_ingredients
FOR ALL
USING (has_role(auth.uid(), 'bodega'::app_role));
