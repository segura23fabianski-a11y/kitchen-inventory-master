-- ============================================
-- 1) INVENTORY_MOVEMENTS: Remove duplicate triggers
-- ============================================

-- INSERT: Keep 'trg_update_stock_on_movement', drop 'on_inventory_movement'
-- Both execute update_stock_on_movement on AFTER INSERT
DROP TRIGGER IF EXISTS on_inventory_movement ON public.inventory_movements;

-- DELETE: Keep 'trg_revert_stock_on_movement_delete', drop 'revert_stock_on_movement_delete'
-- Both execute revert_stock_on_movement_delete on AFTER DELETE
DROP TRIGGER IF EXISTS revert_stock_on_movement_delete ON public.inventory_movements;

-- ============================================
-- 2) PURCHASE_INVOICE_ITEMS: Remove duplicate triggers
-- ============================================

-- Block edit: Keep 'trg_block_posted_invoice_item_edit', drop 'trg_block_posted_item'
DROP TRIGGER IF EXISTS trg_block_posted_item ON public.purchase_invoice_items;

-- Calc line total: Keep 'trg_calc_invoice_item_line_total', drop 'trg_calc_line_total'
DROP TRIGGER IF EXISTS trg_calc_line_total ON public.purchase_invoice_items;

-- ============================================
-- 3) PURCHASE_INVOICES: Remove duplicate triggers
-- ============================================

-- Block edit: Keep 'trg_block_posted_invoice_edit', drop 'trg_block_posted_invoice'
DROP TRIGGER IF EXISTS trg_block_posted_invoice ON public.purchase_invoices;

-- ============================================
-- 4) PRODUCTS: Remove duplicate updated_at triggers
-- ============================================

-- Keep 'trg_update_products_updated_at', drop the other two
DROP TRIGGER IF EXISTS trg_update_updated_at ON public.products;
DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;

-- ============================================
-- 6) FIX recalculate_all_stock for multi-tenant
-- ============================================
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
  -- Get the restaurant_id of the calling user
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
      ELSIF _mov.type IN ('salida', 'operational_consumption', 'merma', 'desperdicio', 'vencimiento', 'daño') THEN
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