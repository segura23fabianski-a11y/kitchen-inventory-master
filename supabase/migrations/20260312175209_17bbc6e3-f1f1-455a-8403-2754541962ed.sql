
-- 1. Add source_module column to inventory_movements
ALTER TABLE public.inventory_movements ADD COLUMN IF NOT EXISTS source_module text DEFAULT NULL;

-- 2. Update update_stock_on_movement to handle pos_sale (subtract like salida)
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

  ELSIF NEW.type IN ('salida', 'pos_sale', 'operational_consumption', 'merma', 'desperdicio', 'vencimiento', 'daño') THEN
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

-- 3. Update revert_stock_on_movement_delete to handle pos_sale
CREATE OR REPLACE FUNCTION public.revert_stock_on_movement_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.type = 'entrada' THEN
    UPDATE public.products SET current_stock = current_stock - OLD.quantity WHERE id = OLD.product_id;
  ELSIF OLD.type IN ('salida', 'pos_sale', 'operational_consumption', 'merma', 'desperdicio', 'vencimiento', 'daño') THEN
    UPDATE public.products SET current_stock = current_stock + OLD.quantity WHERE id = OLD.product_id;
  END IF;
  RETURN OLD;
END;
$function$;

-- 4. Update recalculate_all_stock to handle pos_sale
CREATE OR REPLACE FUNCTION public.recalculate_all_stock()
 RETURNS TABLE(product_id uuid, product_name text, old_stock numeric, new_stock numeric, difference numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _prod RECORD;
  _mov RECORD;
  _running_stock numeric;
  _old_stock numeric;
  _restaurant_id uuid;
BEGIN
  _restaurant_id := get_my_restaurant_id();
  IF _restaurant_id IS NULL THEN
    RAISE EXCEPTION 'No restaurant found for current user';
  END IF;

  FOR _prod IN SELECT id, name, current_stock FROM public.products WHERE restaurant_id = _restaurant_id
  LOOP
    _running_stock := 0;
    
    FOR _mov IN 
      SELECT m.type, m.quantity, m.created_at
      FROM public.inventory_movements m
      WHERE m.product_id = _prod.id
      ORDER BY m.movement_date ASC, m.created_at ASC
    LOOP
      IF _mov.type = 'entrada' THEN
        _running_stock := _running_stock + ABS(_mov.quantity);
      ELSIF _mov.type IN ('salida', 'pos_sale', 'operational_consumption', 'merma', 'desperdicio', 'vencimiento', 'daño') THEN
        _running_stock := _running_stock - ABS(_mov.quantity);
      ELSIF _mov.type = 'ajuste' THEN
        _running_stock := _mov.quantity;
      END IF;
    END LOOP;
    
    _old_stock := _prod.current_stock;
    
    IF ABS(_old_stock - _running_stock) > 0.001 THEN
      UPDATE public.products SET current_stock = _running_stock WHERE id = _prod.id;
      
      product_id := _prod.id;
      product_name := _prod.name;
      old_stock := _old_stock;
      new_stock := _running_stock;
      difference := _old_stock - _running_stock;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;
