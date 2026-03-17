
-- Fix revert_stock_on_movement_delete to handle transformacion type
CREATE OR REPLACE FUNCTION public.revert_stock_on_movement_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.type = 'entrada' THEN
    UPDATE public.products SET current_stock = current_stock - OLD.quantity WHERE id = OLD.product_id;
  ELSIF OLD.type IN ('salida', 'pos_sale', 'operational_consumption', 'merma', 'desperdicio', 'vencimiento', 'daño', 'transformacion') THEN
    UPDATE public.products SET current_stock = current_stock + OLD.quantity WHERE id = OLD.product_id;
  END IF;
  RETURN OLD;
END;
$$;
