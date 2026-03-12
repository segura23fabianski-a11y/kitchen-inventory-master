-- Allow admins to delete any purchase order (not just drafts)
CREATE POLICY "Admin can delete purchase_orders"
ON public.purchase_orders
FOR DELETE
TO public
USING (
  restaurant_id = get_my_restaurant_id()
  AND has_role(auth.uid(), 'admin')
);
