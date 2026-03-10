
-- 1) Add last_unit_cost column to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS last_unit_cost numeric DEFAULT NULL;

-- 2) Update trigger function to also set last_unit_cost
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
    -- Update last_unit_cost if unit_cost > 0
    IF COALESCE(NEW.unit_cost, 0) > 0 THEN
      IF (_old_stock + NEW.quantity) > 0 THEN
        UPDATE public.products SET 
          current_stock = current_stock + NEW.quantity,
          average_cost = ((_old_stock * COALESCE(_old_avg, 0)) + (NEW.quantity * NEW.unit_cost)) / (_old_stock + NEW.quantity),
          last_unit_cost = NEW.unit_cost
        WHERE id = NEW.product_id;
      ELSE
        UPDATE public.products SET 
          current_stock = current_stock + NEW.quantity,
          average_cost = NEW.unit_cost,
          last_unit_cost = NEW.unit_cost
        WHERE id = NEW.product_id;
      END IF;
    ELSE
      UPDATE public.products SET current_stock = current_stock + NEW.quantity WHERE id = NEW.product_id;
    END IF;
  ELSIF NEW.type IN ('salida', 'operational_consumption') THEN
    UPDATE public.products SET current_stock = current_stock - NEW.quantity WHERE id = NEW.product_id;
  ELSIF NEW.type = 'ajuste' THEN
    -- For adjustments: set stock to quantity, and update costs if provided
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

-- 3) Ensure triggers are attached
DROP TRIGGER IF EXISTS trg_update_stock_on_movement ON public.inventory_movements;
CREATE TRIGGER trg_update_stock_on_movement
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_on_movement();

DROP TRIGGER IF EXISTS trg_revert_stock_on_movement_delete ON public.inventory_movements;
CREATE TRIGGER trg_revert_stock_on_movement_delete
  AFTER DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.revert_stock_on_movement_delete();

DROP TRIGGER IF EXISTS trg_validate_movement_backdate ON public.inventory_movements;
CREATE TRIGGER trg_validate_movement_backdate
  BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.validate_movement_backdate();

-- 4) Ensure invoice triggers are attached
DROP TRIGGER IF EXISTS trg_calc_invoice_item_line_total ON public.purchase_invoice_items;
CREATE TRIGGER trg_calc_invoice_item_line_total
  BEFORE INSERT OR UPDATE ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.calc_invoice_item_line_total();

DROP TRIGGER IF EXISTS trg_update_invoice_total ON public.purchase_invoice_items;
CREATE TRIGGER trg_update_invoice_total
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.update_invoice_total();

DROP TRIGGER IF EXISTS trg_block_posted_invoice_edit ON public.purchase_invoices;
CREATE TRIGGER trg_block_posted_invoice_edit
  BEFORE UPDATE OR DELETE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.block_posted_invoice_edit();

DROP TRIGGER IF EXISTS trg_block_posted_invoice_item_edit ON public.purchase_invoice_items;
CREATE TRIGGER trg_block_posted_invoice_item_edit
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.block_posted_invoice_item_edit();

DROP TRIGGER IF EXISTS trg_validate_invoice_item ON public.purchase_invoice_items;
CREATE TRIGGER trg_validate_invoice_item
  BEFORE INSERT OR UPDATE ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_item();

-- 5) updated_at trigger for products
DROP TRIGGER IF EXISTS trg_update_products_updated_at ON public.products;
CREATE TRIGGER trg_update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Initialize last_unit_cost from existing average_cost where possible
UPDATE public.products SET last_unit_cost = average_cost WHERE average_cost > 0 AND last_unit_cost IS NULL;
