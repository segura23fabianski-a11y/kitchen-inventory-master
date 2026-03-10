
-- Branding settings (one per restaurant)
CREATE TABLE public.branding_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE UNIQUE,
  app_name TEXT,
  logo_url TEXT,
  logo_small_url TEXT,
  favicon_url TEXT,
  primary_color TEXT,
  secondary_color TEXT,
  accent_color TEXT,
  login_background_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.branding_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view branding" ON public.branding_settings
  FOR SELECT USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin can manage branding" ON public.branding_settings
  FOR ALL USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Storage bucket for branding assets
INSERT INTO storage.buckets (id, name, public) VALUES ('branding', 'branding', true);

CREATE POLICY "Admin can upload branding files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'branding' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can update branding files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'branding' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete branding files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'branding' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view branding files" ON storage.objects
  FOR SELECT USING (bucket_id = 'branding');
