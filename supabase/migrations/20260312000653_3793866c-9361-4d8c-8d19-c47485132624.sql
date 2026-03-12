
-- Create reservations table
CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  company_id UUID NULL REFERENCES public.hotel_companies(id),
  contact_name TEXT NULL,
  contact_phone TEXT NULL,
  contact_email TEXT NULL,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create reservation_items table
CREATE TABLE public.reservation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id UUID NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
  room_type_id UUID NOT NULL REFERENCES public.room_types(id),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  rate_applied NUMERIC NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservation_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for reservations
CREATE POLICY "Tenant users can view reservations"
  ON public.reservations FOR SELECT
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can insert reservations"
  ON public.reservations FOR INSERT
  TO public
  WITH CHECK (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update reservations"
  ON public.reservations FOR UPDATE
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin can delete reservations"
  ON public.reservations FOR DELETE
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'));

-- RLS policies for reservation_items
CREATE POLICY "Tenant users can view reservation_items"
  ON public.reservation_items FOR SELECT
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can insert reservation_items"
  ON public.reservation_items FOR INSERT
  TO public
  WITH CHECK (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update reservation_items"
  ON public.reservation_items FOR UPDATE
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can delete reservation_items"
  ON public.reservation_items FOR DELETE
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- Enable realtime for reservations
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;
