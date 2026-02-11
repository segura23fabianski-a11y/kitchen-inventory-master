
CREATE OR REPLACE FUNCTION public.revert_stock_on_movement_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.type = 'entrada' THEN
    UPDATE public.products SET current_stock = current_stock - OLD.quantity WHERE id = OLD.product_id;
  ELSIF OLD.type = 'salida' THEN
    UPDATE public.products SET current_stock = current_stock + OLD.quantity WHERE id = OLD.product_id;
  END IF;
  -- For 'ajuste' we cannot reliably revert, so we skip it
  RETURN OLD;
END;
$$;

CREATE TRIGGER revert_stock_on_movement_delete
  BEFORE DELETE ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.revert_stock_on_movement_delete();
