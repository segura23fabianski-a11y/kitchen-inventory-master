
-- Create company_rates table
CREATE TABLE public.company_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.hotel_companies(id) ON DELETE CASCADE,
  room_type_id UUID NOT NULL REFERENCES public.room_types(id) ON DELETE CASCADE,
  rate_per_night NUMERIC NOT NULL DEFAULT 0,
  includes_laundry BOOLEAN NOT NULL DEFAULT true,
  includes_housekeeping BOOLEAN NOT NULL DEFAULT true,
  includes_breakfast BOOLEAN NOT NULL DEFAULT false,
  notes TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, room_type_id)
);

ALTER TABLE public.company_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage company_rates"
  ON public.company_rates FOR ALL
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view company_rates"
  ON public.company_rates FOR SELECT
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- Add source_rate to stays
ALTER TABLE public.stays ADD COLUMN source_rate TEXT NOT NULL DEFAULT 'standard';
