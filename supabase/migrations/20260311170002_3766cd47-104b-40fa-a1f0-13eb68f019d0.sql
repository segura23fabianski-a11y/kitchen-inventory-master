
-- Update the stock trigger to always use ABS(quantity) as safety
CREATE OR REPLACE FUNCTION public.update_stock_on_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _old_stock numeric;
  _old_avg numeric;
  _new_avg numeric;
  _qty numeric;
BEGIN
  -- Always use absolute value for safety
  _qty := ABS(NEW.quantity);

  SELECT current_stock, average_cost INTO _old_stock, _old_avg
    FROM public.products WHERE id = NEW.product_id;

  _old_stock := COALESCE(_old_stock, 0);
  _old_avg := COALESCE(_old_avg, 0);

  IF NEW.type = 'entrada' THEN
    IF COALESCE(NEW.unit_cost, 0) > 0 THEN
      IF (_old_stock + _qty) > 0 THEN
        _new_avg := ((_old_stock * _old_avg) + (_qty * NEW.unit_cost)) / (_old_stock + _qty);
      ELSE
        _new_avg := NEW.unit_cost;
      END IF;
      UPDATE public.products SET 
        current_stock = current_stock + _qty,
        average_cost = _new_avg,
        last_unit_cost = NEW.unit_cost
      WHERE id = NEW.product_id;
    ELSE
      UPDATE public.products SET current_stock = current_stock + _qty WHERE id = NEW.product_id;
    END IF;

  ELSIF NEW.type IN ('salida', 'operational_consumption', 'merma', 'desperdicio', 'vencimiento', 'daño') THEN
    UPDATE public.products SET current_stock = current_stock - _qty WHERE id = NEW.product_id;

  ELSIF NEW.type = 'ajuste' THEN
    IF COALESCE(NEW.unit_cost, 0) > 0 THEN
      UPDATE public.products SET 
        current_stock = _qty,
        last_unit_cost = NEW.unit_cost,
        average_cost = CASE 
          WHEN COALESCE(average_cost, 0) = 0 THEN NEW.unit_cost 
          ELSE average_cost 
        END
      WHERE id = NEW.product_id;
    ELSE
      UPDATE public.products SET current_stock = _qty WHERE id = NEW.product_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
