CREATE OR REPLACE FUNCTION public.register_recipe_consumption(_recipe_id uuid, _user_id uuid, _portions integer, _notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _ing RECORD;
  _product_unit text;
  _product_avg numeric;
  _product_stock numeric;
  _qty_in_product_unit numeric;
  _total numeric;
  _recipe_base numeric;
  _product_base numeric;
  _restaurant_id uuid;
BEGIN
  -- Get restaurant_id from user profile
  SELECT restaurant_id INTO _restaurant_id FROM public.profiles WHERE user_id = _user_id AND status = 'active' LIMIT 1;
  IF _restaurant_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró restaurante para el usuario';
  END IF;

  FOR _ing IN
    SELECT ri.product_id, ri.quantity, ri.unit
    FROM public.recipe_ingredients ri
    WHERE ri.recipe_id = _recipe_id
  LOOP
    SELECT unit, average_cost, current_stock
      INTO _product_unit, _product_avg, _product_stock
      FROM public.products WHERE id = _ing.product_id;

    _recipe_base := CASE _ing.unit
      WHEN 'kg' THEN 1000 WHEN 'g' THEN 1
      WHEN 'l' THEN 1000 WHEN 'ml' THEN 1
      ELSE 1 END;
    _product_base := CASE _product_unit
      WHEN 'kg' THEN 1000 WHEN 'g' THEN 1
      WHEN 'l' THEN 1000 WHEN 'ml' THEN 1
      ELSE 1 END;

    _qty_in_product_unit := (_ing.quantity * _portions * _recipe_base) / _product_base;
    _total := _qty_in_product_unit * _product_avg;

    IF _qty_in_product_unit > _product_stock THEN
      RAISE EXCEPTION 'Stock insuficiente para producto %', _ing.product_id;
    END IF;

    INSERT INTO public.inventory_movements (product_id, recipe_id, user_id, type, quantity, unit_cost, total_cost, notes, restaurant_id)
    VALUES (_ing.product_id, _recipe_id, _user_id, 'salida', _qty_in_product_unit, _product_avg, _total, _notes, _restaurant_id);
  END LOOP;
END;
$function$;