
-- Table: transformation process templates
CREATE TABLE public.transformation_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  name text NOT NULL,
  input_product_id uuid NOT NULL REFERENCES public.products(id),
  output_product_id uuid NOT NULL REFERENCES public.products(id),
  waste_product_id uuid REFERENCES public.products(id),
  expected_yield numeric DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transformation_processes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view transformation_processes"
  ON public.transformation_processes FOR SELECT
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage transformation_processes"
  ON public.transformation_processes FOR ALL
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Table: transformation execution logs
CREATE TABLE public.transformation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  process_id uuid REFERENCES public.transformation_processes(id),
  input_product_id uuid NOT NULL REFERENCES public.products(id),
  output_product_id uuid NOT NULL REFERENCES public.products(id),
  waste_product_id uuid REFERENCES public.products(id),
  input_quantity numeric NOT NULL,
  output_quantity numeric NOT NULL,
  waste_quantity numeric NOT NULL DEFAULT 0,
  yield_percentage numeric NOT NULL DEFAULT 0,
  performed_by uuid NOT NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transformation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view transformation_logs"
  ON public.transformation_logs FOR SELECT
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage transformation_logs"
  ON public.transformation_logs FOR ALL
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Add system function for permissions
INSERT INTO public.system_functions (key, label, description, category, sort_order)
VALUES ('transformations', 'Transformaciones', 'Gestionar transformaciones de productos', 'inventario', 35);
