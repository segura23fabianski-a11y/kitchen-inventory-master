
-- App settings table for feature flags
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT 'false'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, key)
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Only admin can view settings for their tenant
CREATE POLICY "Admin can view tenant settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'));

-- Only admin can manage settings
CREATE POLICY "Admin can manage tenant settings"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'));
