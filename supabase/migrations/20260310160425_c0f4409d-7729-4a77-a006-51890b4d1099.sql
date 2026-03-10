
-- Create service_categories junction table
CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  service_id uuid NOT NULL REFERENCES public.operational_services(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(service_id, category_id)
);

ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

-- View: any authenticated tenant user
CREATE POLICY "Tenant users can view service_categories"
  ON public.service_categories FOR SELECT
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- Manage: admin and bodega
CREATE POLICY "Admin and bodega can manage service_categories"
  ON public.service_categories FOR ALL
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());
