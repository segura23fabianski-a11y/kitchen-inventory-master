
-- Create linen movements history table
CREATE TABLE public.hotel_linen_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  linen_id UUID NOT NULL REFERENCES public.hotel_linen_inventory(id) ON DELETE CASCADE,
  from_location TEXT NOT NULL,
  to_location TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  room_id UUID NULL REFERENCES public.rooms(id),
  stay_id UUID NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL
);

-- RLS
ALTER TABLE public.hotel_linen_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage linen_movements"
  ON public.hotel_linen_movements FOR ALL
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view linen_movements"
  ON public.hotel_linen_movements FOR SELECT
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
