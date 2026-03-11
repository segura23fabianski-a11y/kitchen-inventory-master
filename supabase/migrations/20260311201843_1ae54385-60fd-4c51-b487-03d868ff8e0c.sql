
-- Add component_mode to recipe_variable_components
-- 'product' = direct product selection, 'recipe' = select a fixed recipe to execute
ALTER TABLE public.recipe_variable_components
ADD COLUMN component_mode text NOT NULL DEFAULT 'product'
CHECK (component_mode IN ('product', 'recipe'));

-- Add selected_recipe_id to combo_execution_items for recipe-type components
ALTER TABLE public.combo_execution_items
ADD COLUMN selected_recipe_id uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
ADD COLUMN is_recipe_component boolean NOT NULL DEFAULT false,
ADD COLUMN theoretical_quantity numeric,
ADD COLUMN actual_quantity numeric;
