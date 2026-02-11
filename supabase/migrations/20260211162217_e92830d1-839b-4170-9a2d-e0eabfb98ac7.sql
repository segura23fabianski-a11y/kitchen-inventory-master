
CREATE OR REPLACE FUNCTION public.register_recipe_consumption(
  _recipe_id uuid,
  _user_id uuid,
  _portions int,
  _notes text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ing RECORD;
  _product_unit text;
  _product_avg numeric;
  _product_stock numeric;
  _qty_in_product_unit numeric;
  _total numeric;
  _recipe_base numeric;
  _product_base numeric;
BEGIN
  FOR _ing IN
    SELECT ri.product_id, ri.quantity, ri.unit
    FROM public.recipe_ingredients ri
    WHERE ri.recipe_id = _recipe_id
  LOOP
    -- Get product info
    SELECT unit, average_cost, current_stock
      INTO _product_unit, _product_avg, _product_stock
      FROM public.products WHERE id = _ing.product_id;

    -- Unit conversion (same logic as frontend)
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

    -- Validate stock
    IF _qty_in_product_unit > _product_stock THEN
      RAISE EXCEPTION 'Stock insuficiente para producto %', _ing.product_id;
    END IF;

    -- Insert movement (trigger handles stock update)
    INSERT INTO public.inventory_movements (product_id, recipe_id, user_id, type, quantity, unit_cost, total_cost, notes)
    VALUES (_ing.product_id, _recipe_id, _user_id, 'salida', _qty_in_product_unit, _product_avg, _total, _notes);
  END LOOP;
END;
$$;
