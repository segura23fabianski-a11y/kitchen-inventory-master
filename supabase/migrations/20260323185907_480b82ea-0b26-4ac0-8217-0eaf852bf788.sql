
-- ============================================
-- 1. Purchase Presentations (packaging units)
-- ============================================
CREATE TABLE public.purchase_presentations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  name text NOT NULL,
  conversion_factor numeric NOT NULL DEFAULT 1,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_presentation_factor()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.conversion_factor <= 0 THEN
    RAISE EXCEPTION 'El factor de conversión debe ser mayor a 0';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_presentation_factor
  BEFORE INSERT OR UPDATE ON public.purchase_presentations
  FOR EACH ROW EXECUTE FUNCTION public.validate_presentation_factor();

CREATE UNIQUE INDEX idx_presentations_unique 
  ON public.purchase_presentations (product_id, lower(name), COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid), restaurant_id);

ALTER TABLE public.purchase_presentations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_presentations_all" ON public.purchase_presentations
  FOR ALL TO authenticated
  USING (restaurant_id = public.get_my_restaurant_id())
  WITH CHECK (restaurant_id = public.get_my_restaurant_id());

-- ============================================
-- 2. Invoice Product Aliases (learning/matching)
-- ============================================
CREATE TABLE public.invoice_product_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  external_name text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  presentation_id uuid REFERENCES public.purchase_presentations(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  confidence numeric DEFAULT 1.0,
  times_used integer DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_aliases_unique 
  ON public.invoice_product_aliases (restaurant_id, lower(external_name), COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE public.invoice_product_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_aliases_all" ON public.invoice_product_aliases
  FOR ALL TO authenticated
  USING (restaurant_id = public.get_my_restaurant_id())
  WITH CHECK (restaurant_id = public.get_my_restaurant_id());

-- ============================================
-- 3. Smart Invoices (staging/inbox)
-- ============================================
CREATE TABLE public.smart_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  pdf_url text,
  status text NOT NULL DEFAULT 'pending',
  supplier_id uuid REFERENCES public.suppliers(id),
  supplier_name text,
  invoice_number text,
  invoice_date date,
  total_detected numeric,
  ai_raw_response jsonb,
  linked_invoice_id uuid REFERENCES public.purchase_invoices(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  validated_by uuid,
  validated_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.smart_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_smart_invoices_all" ON public.smart_invoices
  FOR ALL TO authenticated
  USING (restaurant_id = public.get_my_restaurant_id())
  WITH CHECK (restaurant_id = public.get_my_restaurant_id());

-- ============================================
-- 4. Smart Invoice Items (parsed line items)
-- ============================================
CREATE TABLE public.smart_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  smart_invoice_id uuid NOT NULL REFERENCES public.smart_invoices(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  raw_description text,
  raw_quantity text,
  raw_unit_price text,
  raw_total text,
  product_id uuid REFERENCES public.products(id),
  presentation_id uuid REFERENCES public.purchase_presentations(id),
  quantity_in_presentation numeric,
  quantity_in_base_unit numeric,
  unit_cost_per_base numeric,
  line_total numeric,
  match_status text DEFAULT 'unmatched',
  match_confidence numeric DEFAULT 0,
  needs_review boolean DEFAULT true,
  is_expense boolean DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.smart_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_smart_invoice_items_all" ON public.smart_invoice_items
  FOR ALL TO authenticated
  USING (restaurant_id = public.get_my_restaurant_id())
  WITH CHECK (restaurant_id = public.get_my_restaurant_id());

-- ============================================
-- 5. Storage bucket for invoice PDFs
-- ============================================
INSERT INTO storage.buckets (id, name, public) VALUES ('invoice-pdfs', 'invoice-pdfs', false);

CREATE POLICY "Auth users upload invoice PDFs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'invoice-pdfs');

CREATE POLICY "Auth users view invoice PDFs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'invoice-pdfs');

CREATE POLICY "Auth users delete invoice PDFs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'invoice-pdfs');
