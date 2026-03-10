
-- ============================================================
-- 1) Attach ALL missing triggers
-- ============================================================

-- Stock update trigger on inventory_movements INSERT
DROP TRIGGER IF EXISTS trg_update_stock_on_movement ON public.inventory_movements;
CREATE TRIGGER trg_update_stock_on_movement
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_on_movement();

-- Revert stock on movement DELETE
DROP TRIGGER IF EXISTS trg_revert_stock_on_movement_delete ON public.inventory_movements;
CREATE TRIGGER trg_revert_stock_on_movement_delete
  AFTER DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.revert_stock_on_movement_delete();

-- Validate backdating
DROP TRIGGER IF EXISTS trg_validate_movement_backdate ON public.inventory_movements;
CREATE TRIGGER trg_validate_movement_backdate
  BEFORE INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.validate_movement_backdate();

-- Invoice item line total
DROP TRIGGER IF EXISTS trg_calc_invoice_item_line_total ON public.purchase_invoice_items;
CREATE TRIGGER trg_calc_invoice_item_line_total
  BEFORE INSERT OR UPDATE ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.calc_invoice_item_line_total();

-- Update invoice total
DROP TRIGGER IF EXISTS trg_update_invoice_total ON public.purchase_invoice_items;
CREATE TRIGGER trg_update_invoice_total
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.update_invoice_total();

-- Block posted invoice edit
DROP TRIGGER IF EXISTS trg_block_posted_invoice_edit ON public.purchase_invoices;
CREATE TRIGGER trg_block_posted_invoice_edit
  BEFORE UPDATE OR DELETE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.block_posted_invoice_edit();

-- Block posted invoice item edit
DROP TRIGGER IF EXISTS trg_block_posted_invoice_item_edit ON public.purchase_invoice_items;
CREATE TRIGGER trg_block_posted_invoice_item_edit
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.block_posted_invoice_item_edit();

-- Validate invoice item
DROP TRIGGER IF EXISTS trg_validate_invoice_item ON public.purchase_invoice_items;
CREATE TRIGGER trg_validate_invoice_item
  BEFORE INSERT OR UPDATE ON public.purchase_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_item();

-- Updated_at on products
DROP TRIGGER IF EXISTS trg_update_updated_at ON public.products;
CREATE TRIGGER trg_update_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2) Update the stock trigger to also handle "litro" units
--    and ensure robust cost calculation
-- ============================================================

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

  ELSIF NEW.type IN ('salida', 'operational_consumption') THEN
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

-- ============================================================
-- 3) ONE-TIME: Rebuild average_cost and last_unit_cost 
--    from historical movements for ALL products
-- ============================================================

DO $$
DECLARE
  _prod RECORD;
  _mov RECORD;
  _stock numeric;
  _avg numeric;
  _last_cost numeric;
BEGIN
  FOR _prod IN SELECT id FROM public.products LOOP
    _stock := 0;
    _avg := 0;
    _last_cost := NULL;

    FOR _mov IN
      SELECT type, quantity, unit_cost
      FROM public.inventory_movements
      WHERE product_id = _prod.id
        AND unit_cost IS NOT NULL
        AND unit_cost > 0
        AND quantity > 0
      ORDER BY created_at ASC
    LOOP
      IF _mov.type IN ('entrada', 'ajuste') THEN
        IF _stock + _mov.quantity > 0 THEN
          _avg := ((_stock * COALESCE(_avg, 0)) + (_mov.quantity * _mov.unit_cost)) / (_stock + _mov.quantity);
        ELSE
          _avg := _mov.unit_cost;
        END IF;
        IF _mov.type = 'entrada' THEN
          _stock := _stock + _mov.quantity;
        ELSE
          _stock := _mov.quantity; -- ajuste sets stock
        END IF;
        _last_cost := _mov.unit_cost;
      END IF;
    END LOOP;

    -- Only update if we found costs
    IF _last_cost IS NOT NULL THEN
      UPDATE public.products SET
        average_cost = COALESCE(_avg, 0),
        last_unit_cost = _last_cost
      WHERE id = _prod.id;
    END IF;
  END LOOP;
END;
$$;
