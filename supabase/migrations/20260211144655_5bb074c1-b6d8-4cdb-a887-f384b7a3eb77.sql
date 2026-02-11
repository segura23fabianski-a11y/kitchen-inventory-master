-- Add cost columns to inventory_movements
ALTER TABLE public.inventory_movements 
  ADD COLUMN unit_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN total_cost numeric NOT NULL DEFAULT 0;

-- Update trigger to also recalculate average_cost on entrada
CREATE OR REPLACE FUNCTION public.update_stock_on_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  _old_stock numeric;
  _old_avg numeric;
BEGIN
  SELECT current_stock, average_cost INTO _old_stock, _old_avg
    FROM public.products WHERE id = NEW.product_id;

  IF NEW.type = 'entrada' THEN
    -- Weighted average cost
    IF (_old_stock + NEW.quantity) > 0 THEN
      UPDATE public.products SET 
        current_stock = current_stock + NEW.quantity,
        average_cost = ((_old_stock * _old_avg) + (NEW.quantity * NEW.unit_cost)) / (_old_stock + NEW.quantity)
      WHERE id = NEW.product_id;
    ELSE
      UPDATE public.products SET current_stock = current_stock + NEW.quantity WHERE id = NEW.product_id;
    END IF;
  ELSIF NEW.type = 'salida' THEN
    UPDATE public.products SET current_stock = current_stock - NEW.quantity WHERE id = NEW.product_id;
  ELSIF NEW.type = 'ajuste' THEN
    UPDATE public.products SET current_stock = NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$;