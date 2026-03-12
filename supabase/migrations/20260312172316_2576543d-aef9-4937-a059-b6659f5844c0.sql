-- Safe product deletion: check relations before allowing delete
CREATE OR REPLACE FUNCTION public.safe_delete_product(_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _relations jsonb := '[]'::jsonb;
  _count integer;
  _restaurant_id uuid;
BEGIN
  -- Verify admin role
  IF NOT has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo administradores pueden eliminar productos');
  END IF;

  -- Verify product belongs to user's restaurant
  SELECT restaurant_id INTO _restaurant_id FROM products WHERE id = _product_id;
  IF _restaurant_id IS NULL OR _restaurant_id != get_my_restaurant_id() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Producto no encontrado');
  END IF;

  -- Check inventory_movements
  SELECT COUNT(*) INTO _count FROM inventory_movements WHERE product_id = _product_id;
  IF _count > 0 THEN
    _relations := _relations || jsonb_build_object('table', 'Movimientos de inventario', 'count', _count);
  END IF;

  -- Check recipe_ingredients
  SELECT COUNT(*) INTO _count FROM recipe_ingredients WHERE product_id = _product_id;
  IF _count > 0 THEN
    _relations := _relations || jsonb_build_object('table', 'Ingredientes de recetas', 'count', _count);
  END IF;

  -- Check purchase_invoice_items
  SELECT COUNT(*) INTO _count FROM purchase_invoice_items WHERE product_id = _product_id;
  IF _count > 0 THEN
    _relations := _relations || jsonb_build_object('table', 'Ítems de facturas', 'count', _count);
  END IF;

  -- Check purchase_order_items
  SELECT COUNT(*) INTO _count FROM purchase_order_items WHERE product_id = _product_id;
  IF _count > 0 THEN
    _relations := _relations || jsonb_build_object('table', 'Ítems de pedidos de compra', 'count', _count);
  END IF;

  -- Check menu_items linked
  SELECT COUNT(*) INTO _count FROM menu_items WHERE linked_product_id = _product_id;
  IF _count > 0 THEN
    _relations := _relations || jsonb_build_object('table', 'Ítems del menú POS', 'count', _count);
  END IF;

  -- Check combo_execution_items
  SELECT COUNT(*) INTO _count FROM combo_execution_items WHERE product_id = _product_id;
  IF _count > 0 THEN
    _relations := _relations || jsonb_build_object('table', 'Ejecuciones de combos', 'count', _count);
  END IF;

  -- Check recipe_production_run_items
  SELECT COUNT(*) INTO _count FROM recipe_production_run_items WHERE product_id = _product_id;
  IF _count > 0 THEN
    _relations := _relations || jsonb_build_object('table', 'Producción de recetas', 'count', _count);
  END IF;

  -- Check product_codes
  SELECT COUNT(*) INTO _count FROM product_codes WHERE product_id = _product_id;
  IF _count > 0 THEN
    _relations := _relations || jsonb_build_object('table', 'Códigos de producto', 'count', _count);
  END IF;

  -- Check product_suppliers
  SELECT COUNT(*) INTO _count FROM product_suppliers WHERE product_id = _product_id;
  IF _count > 0 THEN
    _relations := _relations || jsonb_build_object('table', 'Proveedores de producto', 'count', _count);
  END IF;

  IF jsonb_array_length(_relations) > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'El producto tiene relaciones activas y no puede eliminarse',
      'relations', _relations,
      'suggestion', 'Inactiva el producto en lugar de eliminarlo'
    );
  END IF;

  -- Safe to delete
  DELETE FROM products WHERE id = _product_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$;