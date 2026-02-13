-- Allow admins to delete profiles (needed for delete-user edge function cleanup)
CREATE POLICY "Admins can delete tenant profiles"
ON public.profiles
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    restaurant_id = get_my_restaurant_id()
    OR (status = 'pending' AND restaurant_id IS NULL)
  )
);
