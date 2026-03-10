
-- Add waste-specific columns to inventory_movements
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS waste_reason TEXT NULL,
  ADD COLUMN IF NOT EXISTS evidence_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS loss_value NUMERIC NULL;

-- Update stock trigger to handle waste movement types
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
BEGIN
  SELECT current_stock, average_cost INTO _old_stock, _old_avg
    FROM public.products WHERE id = NEW.product_id;

  _old_stock := COALESCE(_old_stock, 0);
  _old_avg := COALESCE(_old_avg, 0);

  IF NEW.type = 'entrada' THEN
    IF COALESCE(NEW.unit_cost, 0) > 0 THEN
      IF (_old_stock + NEW.quantity) > 0 THEN
        _new_avg := ((_old_stock * _old_avg) + (NEW.quantity * NEW.unit_cost)) / (_old_stock + NEW.quantity);
      ELSE
        _new_avg := NEW.unit_cost;
      END IF;
      UPDATE public.products SET 
        current_stock = current_stock + NEW.quantity,
        average_cost = _new_avg,
        last_unit_cost = NEW.unit_cost
      WHERE id = NEW.product_id;
    ELSE
      UPDATE public.products SET current_stock = current_stock + NEW.quantity WHERE id = NEW.product_id;
    END IF;

  ELSIF NEW.type IN ('salida', 'operational_consumption', 'merma', 'desperdicio', 'vencimiento', 'daño') THEN
    UPDATE public.products SET current_stock = current_stock - NEW.quantity WHERE id = NEW.product_id;

  ELSIF NEW.type = 'ajuste' THEN
    IF COALESCE(NEW.unit_cost, 0) > 0 THEN
      UPDATE public.products SET 
        current_stock = NEW.quantity,
        last_unit_cost = NEW.unit_cost,
        average_cost = CASE 
          WHEN COALESCE(average_cost, 0) = 0 THEN NEW.unit_cost 
          ELSE average_cost 
        END
      WHERE id = NEW.product_id;
    ELSE
      UPDATE public.products SET current_stock = NEW.quantity WHERE id = NEW.product_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Update revert trigger to handle waste types
CREATE OR REPLACE FUNCTION public.revert_stock_on_movement_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.type = 'entrada' THEN
    UPDATE public.products SET current_stock = current_stock - OLD.quantity WHERE id = OLD.product_id;
  ELSIF OLD.type IN ('salida', 'operational_consumption', 'merma', 'desperdicio', 'vencimiento', 'daño') THEN
    UPDATE public.products SET current_stock = current_stock + OLD.quantity WHERE id = OLD.product_id;
  END IF;
  RETURN OLD;
END;
$function$;

-- Create storage bucket for waste evidence
INSERT INTO storage.buckets (id, name, public)
VALUES ('waste-evidence', 'waste-evidence', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload
CREATE POLICY "Authenticated users can upload waste evidence"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'waste-evidence');

CREATE POLICY "Anyone can view waste evidence"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'waste-evidence');

CREATE POLICY "Users can delete own waste evidence"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'waste-evidence');
