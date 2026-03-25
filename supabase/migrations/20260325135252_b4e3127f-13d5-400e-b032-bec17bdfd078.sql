
CREATE TABLE public.report_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  name text NOT NULL,
  report_type text NOT NULL DEFAULT 'custom',
  document_code text,
  version text DEFAULT '1.0',
  company_name text,
  company_nit text,
  company_address text,
  company_phone text,
  company_email text,
  logo_url text,
  primary_color text DEFAULT '#E1AB18',
  elaborated_by text,
  approved_by text,
  footer_text text,
  legal_text text,
  show_page_number boolean DEFAULT true,
  show_print_date boolean DEFAULT true,
  signature_name text,
  signature_role text,
  is_default boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can manage report_templates"
ON public.report_templates FOR ALL
USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()))
WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE TABLE public.custom_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  name text NOT NULL,
  data_source text NOT NULL,
  columns_config jsonb NOT NULL DEFAULT '[]',
  filters_config jsonb NOT NULL DEFAULT '[]',
  sort_field text,
  sort_direction text DEFAULT 'desc',
  template_id uuid REFERENCES public.report_templates(id),
  active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.custom_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can manage custom_reports"
ON public.custom_reports FOR ALL
USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()))
WITH CHECK (restaurant_id = get_my_restaurant_id());
