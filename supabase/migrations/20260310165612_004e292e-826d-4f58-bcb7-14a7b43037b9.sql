
-- Create physical_counts table
CREATE TABLE public.physical_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  name TEXT NOT NULL,
  count_date DATE NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id UUID NULL REFERENCES public.warehouses(id),
  category_id UUID NULL REFERENCES public.categories(id),
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT NULL,
  created_by UUID NOT NULL,
  approved_by UUID NULL,
  approved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create physical_count_items table
CREATE TABLE public.physical_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES public.physical_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  system_stock NUMERIC NOT NULL DEFAULT 0,
  counted_stock NUMERIC NULL,
  difference NUMERIC NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_physical_count_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('draft', 'review', 'approved') THEN
    RAISE EXCEPTION 'Estado inválido: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_physical_count_status
  BEFORE INSERT OR UPDATE ON public.physical_counts
  FOR EACH ROW EXECUTE FUNCTION public.validate_physical_count_status();

-- RLS
ALTER TABLE public.physical_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_count_items ENABLE ROW LEVEL SECURITY;

-- physical_counts policies
CREATE POLICY "Tenant users can view physical_counts"
  ON public.physical_counts FOR SELECT
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can insert physical_counts"
  ON public.physical_counts FOR INSERT
  WITH CHECK (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')));

CREATE POLICY "Admin and bodega can update draft physical_counts"
  ON public.physical_counts FOR UPDATE
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')));

CREATE POLICY "Admin can delete draft physical_counts"
  ON public.physical_counts FOR DELETE
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin') AND status = 'draft');

-- physical_count_items policies
CREATE POLICY "Tenant users can view physical_count_items"
  ON public.physical_count_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.physical_counts pc
    WHERE pc.id = count_id AND pc.restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid())
  ));

CREATE POLICY "Admin and bodega can manage physical_count_items"
  ON public.physical_count_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.physical_counts pc
    WHERE pc.id = count_id AND pc.restaurant_id = get_my_restaurant_id()
      AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.physical_counts pc
    WHERE pc.id = count_id AND pc.restaurant_id = get_my_restaurant_id()
      AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega'))
  ));
