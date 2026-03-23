
-- Table for product equivalents (bidirectional relationships)
CREATE TABLE public.product_equivalents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  equivalent_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  priority integer NOT NULL DEFAULT 0,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_id, equivalent_product_id),
  CHECK(product_id != equivalent_product_id)
);

-- RLS
ALTER TABLE public.product_equivalents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view product_equivalents"
  ON public.product_equivalents FOR SELECT
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage product_equivalents"
  ON public.product_equivalents FOR ALL
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Index for fast lookups
CREATE INDEX idx_product_equivalents_product ON public.product_equivalents(product_id);
CREATE INDEX idx_product_equivalents_equivalent ON public.product_equivalents(equivalent_product_id);
