
-- Room types
CREATE TABLE public.room_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  base_rate numeric NOT NULL DEFAULT 0,
  max_occupancy integer NOT NULL DEFAULT 2,
  amenities jsonb DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.room_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant users can view room_types" ON public.room_types FOR SELECT USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admin can manage room_types" ON public.room_types FOR ALL USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin')) WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Rooms
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES public.room_types(id) ON DELETE RESTRICT,
  room_number text NOT NULL,
  floor text DEFAULT '',
  status text NOT NULL DEFAULT 'available',
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant users can view rooms" ON public.rooms FOR SELECT USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admin can manage rooms" ON public.rooms FOR ALL USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin')) WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Guests
CREATE TABLE public.hotel_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  document_type text NOT NULL DEFAULT 'CC',
  document_number text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  nationality text DEFAULT 'Colombia',
  birth_date date,
  gender text,
  profession text,
  phone text,
  email text,
  origin_city text,
  origin_country text DEFAULT 'Colombia',
  destination_city text,
  destination_country text DEFAULT 'Colombia',
  travel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(restaurant_id, document_type, document_number)
);
ALTER TABLE public.hotel_guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant users can view hotel_guests" ON public.hotel_guests FOR SELECT USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admin can manage hotel_guests" ON public.hotel_guests FOR ALL USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin')) WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Companies
CREATE TABLE public.hotel_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name text NOT NULL,
  nit text,
  contact_name text,
  phone text,
  email text,
  address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hotel_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant users can view hotel_companies" ON public.hotel_companies FOR SELECT USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admin can manage hotel_companies" ON public.hotel_companies FOR ALL USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin')) WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Stays
CREATE TABLE public.stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE RESTRICT,
  company_id uuid REFERENCES public.hotel_companies(id) ON DELETE SET NULL,
  check_in_at timestamptz NOT NULL DEFAULT now(),
  check_out_at timestamptz,
  expected_check_out timestamptz,
  rate_per_night numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'checked_in',
  payment_method text,
  notes text DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant users can view stays" ON public.stays FOR SELECT USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admin can manage stays" ON public.stays FOR ALL USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin')) WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Stay guests (bridge)
CREATE TABLE public.stay_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stay_id uuid NOT NULL REFERENCES public.stays(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.hotel_guests(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stay_guests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant users can view stay_guests" ON public.stay_guests FOR SELECT USING (EXISTS (SELECT 1 FROM stays s WHERE s.id = stay_guests.stay_id AND s.restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid())));
CREATE POLICY "Admin can manage stay_guests" ON public.stay_guests FOR ALL USING (EXISTS (SELECT 1 FROM stays s WHERE s.id = stay_guests.stay_id AND s.restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))) WITH CHECK (EXISTS (SELECT 1 FROM stays s WHERE s.id = stay_guests.stay_id AND s.restaurant_id = get_my_restaurant_id()));

-- Register hotel permission
INSERT INTO public.system_functions (key, label, description, category, sort_order) VALUES
  ('hotel', 'Módulo Hotelero', 'Gestión de habitaciones, huéspedes y estancias', 'operacion', 70);

-- Grant to admin role
INSERT INTO public.role_permissions (role, function_key)
SELECT 'admin', 'hotel'
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions WHERE role = 'admin' AND function_key = 'hotel');
