
CREATE TABLE public.waste_reason_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  waste_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, waste_type, reason)
);

ALTER TABLE public.waste_reason_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view waste reasons"
ON public.waste_reason_catalog FOR SELECT
TO public
USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage waste reasons"
ON public.waste_reason_catalog FOR ALL
TO public
USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
WITH CHECK (restaurant_id = get_my_restaurant_id());
