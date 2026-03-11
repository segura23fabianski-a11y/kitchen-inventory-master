
-- Production runs: track actual production of fixed recipes
CREATE TABLE public.recipe_production_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  production_date date NOT NULL DEFAULT CURRENT_DATE,
  quantity_produced numeric NOT NULL DEFAULT 0,
  -- Theoretical (based on recipe ingredients × quantity)
  theoretical_total_cost numeric NOT NULL DEFAULT 0,
  theoretical_unit_cost numeric NOT NULL DEFAULT 0,
  -- Actual (real consumption entered by kitchen)
  actual_total_cost numeric NOT NULL DEFAULT 0,
  actual_unit_cost numeric NOT NULL DEFAULT 0,
  notes text,
  produced_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Items: per-ingredient detail of a production run
CREATE TABLE public.recipe_production_run_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.recipe_production_runs(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  theoretical_quantity numeric NOT NULL DEFAULT 0,
  actual_quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'unidad',
  unit_cost numeric NOT NULL DEFAULT 0,
  theoretical_line_cost numeric NOT NULL DEFAULT 0,
  actual_line_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.recipe_production_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_production_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage production runs for their restaurant"
  ON public.recipe_production_runs
  FOR ALL
  TO authenticated
  USING (restaurant_id IN (SELECT restaurant_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (restaurant_id IN (SELECT restaurant_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can manage production run items for their restaurant"
  ON public.recipe_production_run_items
  FOR ALL
  TO authenticated
  USING (run_id IN (SELECT id FROM public.recipe_production_runs WHERE restaurant_id IN (SELECT restaurant_id FROM public.profiles WHERE user_id = auth.uid())))
  WITH CHECK (run_id IN (SELECT id FROM public.recipe_production_runs WHERE restaurant_id IN (SELECT restaurant_id FROM public.profiles WHERE user_id = auth.uid())));

-- Index for quick lookup by recipe + date
CREATE INDEX idx_production_runs_recipe_date ON public.recipe_production_runs(recipe_id, production_date DESC);

-- Add production_run_id reference to combo_execution_items
ALTER TABLE public.combo_execution_items
ADD COLUMN production_run_id uuid REFERENCES public.recipe_production_runs(id) ON DELETE SET NULL,
ADD COLUMN cost_source text NOT NULL DEFAULT 'theoretical' CHECK (cost_source IN ('theoretical', 'production_run'));
