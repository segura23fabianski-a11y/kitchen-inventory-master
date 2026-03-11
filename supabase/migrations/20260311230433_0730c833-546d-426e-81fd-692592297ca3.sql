
-- 1) Add checkout_type to stays
ALTER TABLE public.stays ADD COLUMN IF NOT EXISTS checkout_type text NOT NULL DEFAULT 'normal';

-- 2) Create housekeeping_task_items table
CREATE TABLE public.housekeeping_task_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  housekeeping_task_id uuid NOT NULL REFERENCES public.housekeeping_tasks(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  item_name text NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz NULL,
  notes text NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.housekeeping_task_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage housekeeping_task_items" ON public.housekeeping_task_items
  AS RESTRICTIVE FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view housekeeping_task_items" ON public.housekeeping_task_items
  AS RESTRICTIVE FOR SELECT TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- 3) Create default checklist template table
CREATE TABLE public.housekeeping_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  task_type text NOT NULL DEFAULT 'checkout_clean',
  item_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.housekeeping_checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage checklist_templates" ON public.housekeeping_checklist_templates
  AS RESTRICTIVE FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view checklist_templates" ON public.housekeeping_checklist_templates
  AS RESTRICTIVE FOR SELECT TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- 4) Create laundry_orders table
CREATE TABLE public.laundry_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  stay_id uuid NULL REFERENCES public.stays(id),
  room_id uuid NULL REFERENCES public.rooms(id),
  company_id uuid NULL REFERENCES public.hotel_companies(id),
  guest_id uuid NULL REFERENCES public.hotel_guests(id),
  laundry_type text NOT NULL DEFAULT 'hotel_linen',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  notes text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

ALTER TABLE public.laundry_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage laundry_orders" ON public.laundry_orders
  AS RESTRICTIVE FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view laundry_orders" ON public.laundry_orders
  AS RESTRICTIVE FOR SELECT TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
