
-- Fix RESTRICTIVE policies on housekeeping_task_items
DROP POLICY IF EXISTS "Admin can manage housekeeping_task_items" ON public.housekeeping_task_items;
DROP POLICY IF EXISTS "Tenant users can view housekeeping_task_items" ON public.housekeeping_task_items;
DROP POLICY IF EXISTS "Tenant users can insert housekeeping_task_items" ON public.housekeeping_task_items;
DROP POLICY IF EXISTS "Tenant users can update housekeeping_task_items" ON public.housekeeping_task_items;

CREATE POLICY "Admin can manage housekeeping_task_items"
ON public.housekeeping_task_items FOR ALL TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_role(auth.uid(), 'admin'::text))
WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view housekeeping_task_items"
ON public.housekeeping_task_items FOR SELECT TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can insert housekeeping_task_items"
ON public.housekeeping_task_items FOR INSERT TO public
WITH CHECK ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update housekeeping_task_items"
ON public.housekeeping_task_items FOR UPDATE TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

-- Fix RESTRICTIVE policies on laundry_orders
DROP POLICY IF EXISTS "Admin can manage laundry_orders" ON public.laundry_orders;
DROP POLICY IF EXISTS "Tenant users can view laundry_orders" ON public.laundry_orders;
DROP POLICY IF EXISTS "Tenant users can insert laundry_orders" ON public.laundry_orders;
DROP POLICY IF EXISTS "Tenant users can update laundry_orders" ON public.laundry_orders;

CREATE POLICY "Admin can manage laundry_orders"
ON public.laundry_orders FOR ALL TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_role(auth.uid(), 'admin'::text))
WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view laundry_orders"
ON public.laundry_orders FOR SELECT TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can insert laundry_orders"
ON public.laundry_orders FOR INSERT TO public
WITH CHECK ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update laundry_orders"
ON public.laundry_orders FOR UPDATE TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

-- Fix RESTRICTIVE policies on hotel_linen_room_assignments
DROP POLICY IF EXISTS "Admin can manage linen_room_assignments" ON public.hotel_linen_room_assignments;
DROP POLICY IF EXISTS "Tenant users can view linen_room_assignments" ON public.hotel_linen_room_assignments;

CREATE POLICY "Admin can manage linen_room_assignments"
ON public.hotel_linen_room_assignments FOR ALL TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_role(auth.uid(), 'admin'::text))
WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view linen_room_assignments"
ON public.hotel_linen_room_assignments FOR SELECT TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can insert linen_room_assignments"
ON public.hotel_linen_room_assignments FOR INSERT TO public
WITH CHECK ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update linen_room_assignments"
ON public.hotel_linen_room_assignments FOR UPDATE TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));
