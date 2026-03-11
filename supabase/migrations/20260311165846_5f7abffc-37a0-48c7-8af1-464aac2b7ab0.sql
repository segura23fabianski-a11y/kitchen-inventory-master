
-- 1) Trigger to ensure quantity is always positive (normalize on insert)
CREATE OR REPLACE FUNCTION public.normalize_movement_quantity()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  -- Force quantity to be positive; the 'type' field determines the operation
  IF NEW.quantity < 0 THEN
    NEW.quantity := ABS(NEW.quantity);
  END IF;
  
  -- Recalculate total_cost with corrected quantity
  IF NEW.quantity > 0 AND COALESCE(NEW.unit_cost, 0) > 0 THEN
    NEW.total_cost := NEW.quantity * NEW.unit_cost;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_normalize_movement_quantity
  BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_movement_quantity();

-- 2) Fix existing negative quantities
UPDATE public.inventory_movements
SET quantity = ABS(quantity),
    total_cost = ABS(quantity) * unit_cost
WHERE quantity < 0;

-- 3) Create the stock recalculation function
-- This computes stock purely from movements, respecting adjustments as "set stock to X"
CREATE OR REPLACE FUNCTION public.recalculate_all_stock()
  RETURNS TABLE(product_id uuid, product_name text, old_stock numeric, new_stock numeric, difference numeric)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  _prod RECORD;
  _mov RECORD;
  _running_stock numeric;
  _old_stock numeric;
BEGIN
  FOR _prod IN SELECT id, name, current_stock FROM public.products
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
      ELSIF _mov.type IN ('salida', 'operational_consumption', 'merma', 'desperdicio', 'vencimiento', 'daño') THEN
        _running_stock := _running_stock - ABS(_mov.quantity);
      ELSIF _mov.type = 'ajuste' THEN
        -- Adjustment sets stock to the quantity value
        _running_stock := _mov.quantity;
      END IF;
    END LOOP;
    
    _old_stock := _prod.current_stock;
    
    IF ABS(_old_stock - _running_stock) > 0.001 THEN
      -- Update the product stock
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
$$;
