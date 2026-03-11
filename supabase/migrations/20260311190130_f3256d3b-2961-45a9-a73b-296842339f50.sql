
-- 1) Add order_number column (nullable first for backfill)
ALTER TABLE public.purchase_orders 
  ADD COLUMN IF NOT EXISTS order_number text;

-- 2) Create function to generate next order number per restaurant
CREATE OR REPLACE FUNCTION public.generate_order_number(p_restaurant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _year text;
  _next int;
  _result text;
BEGIN
  _year := EXTRACT(YEAR FROM CURRENT_DATE)::text;
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM 'OC-' || _year || '-(\d+)') AS integer)
  ), 0) + 1
  INTO _next
  FROM public.purchase_orders
  WHERE restaurant_id = p_restaurant_id
    AND order_number LIKE 'OC-' || _year || '-%';
  
  _result := 'OC-' || _year || '-' || LPAD(_next::text, 4, '0');
  RETURN _result;
END;
$$;

-- 3) Backfill existing orders with retroactive numbers
DO $$
DECLARE
  _rec RECORD;
  _counter int;
  _current_restaurant uuid := NULL;
  _current_year text := NULL;
BEGIN
  FOR _rec IN
    SELECT id, restaurant_id, EXTRACT(YEAR FROM order_date)::text AS yr
    FROM public.purchase_orders
    WHERE order_number IS NULL
    ORDER BY restaurant_id, order_date ASC, created_at ASC
  LOOP
    IF _current_restaurant IS DISTINCT FROM _rec.restaurant_id OR _current_year IS DISTINCT FROM _rec.yr THEN
      _current_restaurant := _rec.restaurant_id;
      _current_year := _rec.yr;
      _counter := 0;
    END IF;
    _counter := _counter + 1;
    UPDATE public.purchase_orders
      SET order_number = 'OC-' || _rec.yr || '-' || LPAD(_counter::text, 4, '0')
      WHERE id = _rec.id;
  END LOOP;
END;
$$;

-- 4) Now make it NOT NULL and UNIQUE per restaurant
ALTER TABLE public.purchase_orders
  ALTER COLUMN order_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_order_number_restaurant 
  ON public.purchase_orders(restaurant_id, order_number);

-- 5) Create trigger to auto-generate on insert
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number(NEW.restaurant_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_order_number
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION set_order_number();
