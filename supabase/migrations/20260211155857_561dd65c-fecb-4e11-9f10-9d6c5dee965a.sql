
-- Create warehouses table
CREATE TABLE public.warehouses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view warehouses"
ON public.warehouses FOR SELECT
USING (true);

CREATE POLICY "Admins can manage warehouses"
ON public.warehouses FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Bodega can manage warehouses"
ON public.warehouses FOR ALL
USING (has_role(auth.uid(), 'bodega'::app_role));

-- Add warehouse_id to products
ALTER TABLE public.products
ADD COLUMN warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;
