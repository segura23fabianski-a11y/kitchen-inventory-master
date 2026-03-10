
-- Create junction table: product_operational_services
CREATE TABLE public.product_operational_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.operational_services(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, service_id)
);

ALTER TABLE public.product_operational_services ENABLE ROW LEVEL SECURITY;

-- View: any authenticated tenant user
CREATE POLICY "Tenant users can view product_operational_services"
  ON public.product_operational_services FOR SELECT
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- Manage: admin and bodega
CREATE POLICY "Admin and bodega can manage product_operational_services"
  ON public.product_operational_services FOR ALL
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());
