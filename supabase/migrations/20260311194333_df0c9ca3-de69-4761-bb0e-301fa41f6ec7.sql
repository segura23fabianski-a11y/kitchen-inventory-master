
-- Combo execution logs: one row per combo execution
CREATE TABLE public.combo_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  executed_by uuid NOT NULL,
  servings numeric NOT NULL,
  total_cost numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  executed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Combo execution items: one row per component selection
CREATE TABLE public.combo_execution_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.combo_execution_logs(id) ON DELETE CASCADE,
  component_name text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  line_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.combo_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combo_execution_items ENABLE ROW LEVEL SECURITY;

-- RLS for combo_execution_logs
CREATE POLICY "Tenant users can view combo_execution_logs"
  ON public.combo_execution_logs FOR SELECT
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Authenticated users can insert combo_execution_logs"
  ON public.combo_execution_logs FOR INSERT
  WITH CHECK (restaurant_id = get_my_restaurant_id() AND executed_by = auth.uid());

-- RLS for combo_execution_items
CREATE POLICY "Tenant users can view combo_execution_items"
  ON public.combo_execution_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.combo_execution_logs cel
    WHERE cel.id = combo_execution_items.execution_id
      AND cel.restaurant_id = get_my_restaurant_id()
      AND has_any_role(auth.uid())
  ));

CREATE POLICY "Authenticated users can insert combo_execution_items"
  ON public.combo_execution_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.combo_execution_logs cel
    WHERE cel.id = combo_execution_items.execution_id
      AND cel.restaurant_id = get_my_restaurant_id()
      AND cel.executed_by = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_combo_execution_logs_recipe ON public.combo_execution_logs(recipe_id);
CREATE INDEX idx_combo_execution_logs_restaurant ON public.combo_execution_logs(restaurant_id);
CREATE INDEX idx_combo_execution_items_execution ON public.combo_execution_items(execution_id);
