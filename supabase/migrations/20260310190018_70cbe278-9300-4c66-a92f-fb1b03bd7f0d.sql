
-- Table for PDF template settings per tenant
CREATE TABLE public.purchase_order_pdf_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  document_code text,
  version text,
  format_date text,
  company_name text,
  company_nit text,
  company_address text,
  company_phone text,
  company_email text,
  logo_url text,
  footer_contact_text text,
  approved_by_name text,
  signature_image_url text,
  observations_default text,
  show_taxes boolean DEFAULT true,
  primary_color text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(restaurant_id)
);

ALTER TABLE public.purchase_order_pdf_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage
CREATE POLICY "Admin can manage pdf settings"
ON public.purchase_order_pdf_settings
FOR ALL
USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
WITH CHECK (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'));

-- All tenant users can view (needed to generate PDFs)
CREATE POLICY "Tenant users can view pdf settings"
ON public.purchase_order_pdf_settings
FOR SELECT
USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- Add expected_delivery_date to purchase_orders
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS expected_delivery_date date;
