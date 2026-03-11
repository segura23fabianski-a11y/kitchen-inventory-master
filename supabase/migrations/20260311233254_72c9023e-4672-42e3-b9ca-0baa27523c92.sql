
-- Allow any authenticated tenant user to insert and update housekeeping tasks and items
CREATE POLICY "Tenant users can insert housekeeping_tasks"
  ON public.housekeeping_tasks FOR INSERT
  WITH CHECK (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update housekeeping_tasks"
  ON public.housekeeping_tasks FOR UPDATE
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can insert housekeeping_task_items"
  ON public.housekeeping_task_items FOR INSERT
  WITH CHECK (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Tenant users can update housekeeping_task_items"
  ON public.housekeeping_task_items FOR UPDATE
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- Allow any tenant user to insert linen movements (not just admin)
CREATE POLICY "Tenant users can insert linen_movements"
  ON public.hotel_linen_movements FOR INSERT
  WITH CHECK (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
