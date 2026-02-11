-- Allow admins to delete inventory movements
CREATE POLICY "Admins can delete movements"
ON public.inventory_movements
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));