
-- Allow tenant users to insert stay_guests (for adding guests to stays)
CREATE POLICY "Tenant users can insert stay_guests"
ON public.stay_guests
FOR INSERT
TO public
WITH CHECK (
  EXISTS (
    SELECT 1 FROM stays s
    WHERE s.id = stay_guests.stay_id
      AND s.restaurant_id = get_my_restaurant_id()
      AND has_any_role(auth.uid())
  )
);

-- Allow tenant users to update stay_guests (for promoting to primary)
CREATE POLICY "Tenant users can update stay_guests"
ON public.stay_guests
FOR UPDATE
TO public
USING (
  EXISTS (
    SELECT 1 FROM stays s
    WHERE s.id = stay_guests.stay_id
      AND s.restaurant_id = get_my_restaurant_id()
      AND has_any_role(auth.uid())
  )
);

-- Allow tenant users to delete stay_guests (for partial checkout)
CREATE POLICY "Tenant users can delete stay_guests"
ON public.stay_guests
FOR DELETE
TO public
USING (
  EXISTS (
    SELECT 1 FROM stays s
    WHERE s.id = stay_guests.stay_id
      AND s.restaurant_id = get_my_restaurant_id()
      AND has_any_role(auth.uid())
  )
);
