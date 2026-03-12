
-- POS Tables
CREATE TABLE public.pos_tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  zone TEXT NULL DEFAULT '',
  capacity INTEGER NOT NULL DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'available',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage pos_tables" ON public.pos_tables
  FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view pos_tables" ON public.pos_tables
  FOR SELECT TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- Menu Items
CREATE TABLE public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  price NUMERIC NOT NULL DEFAULT 0,
  linked_recipe_id UUID NULL REFERENCES public.recipes(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage menu_items" ON public.menu_items
  FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view menu_items" ON public.menu_items
  FOR SELECT TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

-- POS Orders
CREATE TABLE public.pos_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL DEFAULT '',
  order_type TEXT NOT NULL DEFAULT 'individual',
  company_id UUID NULL REFERENCES public.hotel_companies(id) ON DELETE SET NULL,
  customer_name TEXT NULL,
  table_id UUID NULL REFERENCES public.pos_tables(id) ON DELETE SET NULL,
  service_period TEXT NOT NULL DEFAULT 'lunch',
  delivery_destination_type TEXT NOT NULL DEFAULT 'dining_area',
  delivery_destination_detail TEXT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  total NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can manage pos_orders" ON public.pos_orders
  FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- POS Order Items
CREATE TABLE public.pos_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.pos_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can manage pos_order_items" ON public.pos_order_items
  FOR ALL TO public
  USING (EXISTS (
    SELECT 1 FROM pos_orders o WHERE o.id = pos_order_items.order_id AND o.restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM pos_orders o WHERE o.id = pos_order_items.order_id AND o.restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid())
  ));

-- Auto-generate order number
CREATE OR REPLACE FUNCTION public.generate_pos_order_number(p_restaurant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _today text;
  _next int;
BEGIN
  _today := to_char(CURRENT_DATE, 'YYYYMMDD');
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM 'POS-' || _today || '-(\d+)') AS integer)
  ), 0) + 1
  INTO _next
  FROM public.pos_orders
  WHERE restaurant_id = p_restaurant_id
    AND order_number LIKE 'POS-' || _today || '-%';
  RETURN 'POS-' || _today || '-' || LPAD(_next::text, 3, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_pos_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_pos_order_number(NEW.restaurant_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_pos_order_number
  BEFORE INSERT ON public.pos_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_pos_order_number();

-- Auto-calc item total
CREATE OR REPLACE FUNCTION public.calc_pos_item_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.total := NEW.quantity * NEW.unit_price;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calc_pos_item_total
  BEFORE INSERT OR UPDATE ON public.pos_order_items
  FOR EACH ROW EXECUTE FUNCTION public.calc_pos_item_total();

-- Update order total on item change
CREATE OR REPLACE FUNCTION public.update_pos_order_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _order_id uuid;
BEGIN
  _order_id := COALESCE(NEW.order_id, OLD.order_id);
  UPDATE public.pos_orders
    SET total = COALESCE((SELECT SUM(total) FROM public.pos_order_items WHERE order_id = _order_id), 0)
    WHERE id = _order_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_update_pos_order_total
  AFTER INSERT OR UPDATE OR DELETE ON public.pos_order_items
  FOR EACH ROW EXECUTE FUNCTION public.update_pos_order_total();
