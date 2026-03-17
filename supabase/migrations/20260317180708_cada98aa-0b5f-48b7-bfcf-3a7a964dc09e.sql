-- Service type component templates: which components belong to each service type
CREATE TABLE public.service_type_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  service_type text NOT NULL, -- desayuno, almuerzo, cena, lonche
  component_id uuid NOT NULL REFERENCES public.meal_components(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, service_type, component_id)
);

-- Enable RLS
ALTER TABLE public.service_type_components ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admin can manage service_type_components"
ON public.service_type_components FOR ALL
USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view service_type_components"
ON public.service_type_components FOR SELECT
USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- Index for lookups
CREATE INDEX idx_service_type_components_lookup ON public.service_type_components(restaurant_id, service_type);