
-- Advanced transformation definitions
CREATE TABLE public.transformation_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  name text NOT NULL,
  input_product_id uuid NOT NULL REFERENCES public.products(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transformation_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view transformation_definitions"
  ON public.transformation_definitions FOR SELECT TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage transformation_definitions"
  ON public.transformation_definitions FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Definition outputs (multiple per definition)
CREATE TABLE public.transformation_definition_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transformation_definition_id uuid NOT NULL REFERENCES public.transformation_definitions(id) ON DELETE CASCADE,
  output_product_id uuid NOT NULL REFERENCES public.products(id),
  output_type text NOT NULL DEFAULT 'output',
  expected_yield_percent numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transformation_definition_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view transformation_definition_outputs"
  ON public.transformation_definition_outputs FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.transformation_definitions td
    WHERE td.id = transformation_definition_outputs.transformation_definition_id
      AND td.restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid())
  ));

CREATE POLICY "Admin and bodega can manage transformation_definition_outputs"
  ON public.transformation_definition_outputs FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.transformation_definitions td
    WHERE td.id = transformation_definition_outputs.transformation_definition_id
      AND td.restaurant_id = get_my_restaurant_id()
      AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.transformation_definitions td
    WHERE td.id = transformation_definition_outputs.transformation_definition_id
      AND td.restaurant_id = get_my_restaurant_id()
  ));

-- Execution runs
CREATE TABLE public.transformation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  transformation_definition_id uuid REFERENCES public.transformation_definitions(id),
  input_product_id uuid NOT NULL REFERENCES public.products(id),
  input_quantity numeric NOT NULL,
  total_output numeric NOT NULL DEFAULT 0,
  total_waste numeric NOT NULL DEFAULT 0,
  overall_yield numeric NOT NULL DEFAULT 0,
  run_date timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transformation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view transformation_runs"
  ON public.transformation_runs FOR SELECT TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage transformation_runs"
  ON public.transformation_runs FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Run outputs (multiple per run)
CREATE TABLE public.transformation_run_outputs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transformation_run_id uuid NOT NULL REFERENCES public.transformation_runs(id) ON DELETE CASCADE,
  output_product_id uuid NOT NULL REFERENCES public.products(id),
  output_type text NOT NULL DEFAULT 'output',
  quantity numeric NOT NULL,
  yield_percent numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transformation_run_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view transformation_run_outputs"
  ON public.transformation_run_outputs FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.transformation_runs tr
    WHERE tr.id = transformation_run_outputs.transformation_run_id
      AND tr.restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid())
  ));

CREATE POLICY "Admin and bodega can manage transformation_run_outputs"
  ON public.transformation_run_outputs FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM public.transformation_runs tr
    WHERE tr.id = transformation_run_outputs.transformation_run_id
      AND tr.restaurant_id = get_my_restaurant_id()
      AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.transformation_runs tr
    WHERE tr.id = transformation_run_outputs.transformation_run_id
      AND tr.restaurant_id = get_my_restaurant_id()
  ));
