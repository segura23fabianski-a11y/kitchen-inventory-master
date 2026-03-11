
-- Hotel linen inventory: reusable items (sheets, towels, pillows, etc.)
CREATE TABLE public.hotel_linen_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  item_name text NOT NULL,
  category text NOT NULL DEFAULT 'bedding',
  total_quantity integer NOT NULL DEFAULT 0,
  in_use integer NOT NULL DEFAULT 0,
  in_laundry integer NOT NULL DEFAULT 0,
  available integer NOT NULL DEFAULT 0,
  condition_notes text NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hotel_linen_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage hotel_linen_inventory" ON public.hotel_linen_inventory
  AS RESTRICTIVE FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view hotel_linen_inventory" ON public.hotel_linen_inventory
  AS RESTRICTIVE FOR SELECT TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- Room-level linen assignments
CREATE TABLE public.hotel_linen_room_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  linen_id uuid NOT NULL REFERENCES public.hotel_linen_inventory(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  notes text NULL
);

ALTER TABLE public.hotel_linen_room_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage linen_room_assignments" ON public.hotel_linen_room_assignments
  AS RESTRICTIVE FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view linen_room_assignments" ON public.hotel_linen_room_assignments
  AS RESTRICTIVE FOR SELECT TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- Add recipe_id to housekeeping_tasks and laundry_orders for linking operational recipes
ALTER TABLE public.housekeeping_tasks ADD COLUMN IF NOT EXISTS recipe_id uuid NULL REFERENCES public.recipes(id);
ALTER TABLE public.laundry_orders ADD COLUMN IF NOT EXISTS recipe_id uuid NULL REFERENCES public.recipes(id);
ALTER TABLE public.laundry_orders ADD COLUMN IF NOT EXISTS total_pieces integer NOT NULL DEFAULT 0;
