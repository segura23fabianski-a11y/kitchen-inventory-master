
-- 1) Create operational_services table
CREATE TABLE public.operational_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active tenant users can view operational services"
  ON public.operational_services FOR SELECT TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage operational services"
  ON public.operational_services FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- 2) Add service_id to inventory_movements
ALTER TABLE public.inventory_movements
  ADD COLUMN service_id UUID REFERENCES public.operational_services(id);

-- 3) Update stock trigger to handle 'operational_consumption' like 'salida'
CREATE OR REPLACE FUNCTION public.update_stock_on_movement()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  _old_stock numeric;
  _old_avg numeric;
BEGIN
  SELECT current_stock, average_cost INTO _old_stock, _old_avg
    FROM public.products WHERE id = NEW.product_id;

  IF NEW.type = 'entrada' THEN
    IF (_old_stock + NEW.quantity) > 0 THEN
      UPDATE public.products SET 
        current_stock = current_stock + NEW.quantity,
        average_cost = ((_old_stock * _old_avg) + (NEW.quantity * NEW.unit_cost)) / (_old_stock + NEW.quantity)
      WHERE id = NEW.product_id;
    ELSE
      UPDATE public.products SET current_stock = current_stock + NEW.quantity WHERE id = NEW.product_id;
    END IF;
  ELSIF NEW.type IN ('salida', 'operational_consumption') THEN
    UPDATE public.products SET current_stock = current_stock - NEW.quantity WHERE id = NEW.product_id;
  ELSIF NEW.type = 'ajuste' THEN
    UPDATE public.products SET current_stock = NEW.quantity WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$function$;

-- 4) Update revert trigger to handle 'operational_consumption'
CREATE OR REPLACE FUNCTION public.revert_stock_on_movement_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.type = 'entrada' THEN
    UPDATE public.products SET current_stock = current_stock - OLD.quantity WHERE id = OLD.product_id;
  ELSIF OLD.type IN ('salida', 'operational_consumption') THEN
    UPDATE public.products SET current_stock = current_stock + OLD.quantity WHERE id = OLD.product_id;
  END IF;
  RETURN OLD;
END;
$function$;

-- 5) Seed default operational services (will be per-restaurant, inserted via app)
