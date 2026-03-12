
-- Add write policies for tenant users on hotel tables that currently only allow admin writes

-- ROOMS: allow any tenant user to insert/update/delete
CREATE POLICY "Tenant users can insert rooms"
ON public.rooms FOR INSERT TO public
WITH CHECK ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update rooms"
ON public.rooms FOR UPDATE TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can delete rooms"
ON public.rooms FOR DELETE TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

-- ROOM_TYPES: allow any tenant user to insert/update/delete
CREATE POLICY "Tenant users can insert room_types"
ON public.room_types FOR INSERT TO public
WITH CHECK ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update room_types"
ON public.room_types FOR UPDATE TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can delete room_types"
ON public.room_types FOR DELETE TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

-- STAYS: allow any tenant user to insert/update
CREATE POLICY "Tenant users can insert stays"
ON public.stays FOR INSERT TO public
WITH CHECK ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update stays"
ON public.stays FOR UPDATE TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

-- HOTEL_GUESTS: allow any tenant user to insert/update
CREATE POLICY "Tenant users can insert hotel_guests"
ON public.hotel_guests FOR INSERT TO public
WITH CHECK ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update hotel_guests"
ON public.hotel_guests FOR UPDATE TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

-- HOTEL_COMPANIES: allow any tenant user to insert/update
CREATE POLICY "Tenant users can insert hotel_companies"
ON public.hotel_companies FOR INSERT TO public
WITH CHECK ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update hotel_companies"
ON public.hotel_companies FOR UPDATE TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

-- LAUNDRY_ORDERS: allow any tenant user to insert/update
CREATE POLICY "Tenant users can insert laundry_orders"
ON public.laundry_orders FOR INSERT TO public
WITH CHECK ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update laundry_orders"
ON public.laundry_orders FOR UPDATE TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

-- GUEST_SIGNATURES: allow any tenant user to insert
CREATE POLICY "Tenant users can insert guest_signatures"
ON public.guest_signatures FOR INSERT TO public
WITH CHECK ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));
