
-- 1) purchase_invoices table
CREATE TABLE public.purchase_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  invoice_number TEXT NOT NULL,
  supplier_name TEXT,
  invoice_date DATE NOT NULL,
  received_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'draft',
  total_amount NUMERIC NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  posted_by UUID,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, invoice_number)
);

-- 2) purchase_invoice_items table
CREATE TABLE public.purchase_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  invoice_id UUID NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,
  line_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Trigger: auto-calc line_total
CREATE OR REPLACE FUNCTION public.calc_invoice_item_line_total()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  NEW.line_total := NEW.quantity * NEW.unit_cost;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calc_line_total
BEFORE INSERT OR UPDATE ON public.purchase_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.calc_invoice_item_line_total();

-- 4) Trigger: update invoice total_amount on item changes
CREATE OR REPLACE FUNCTION public.update_invoice_total()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE _invoice_id uuid;
BEGIN
  _invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  UPDATE public.purchase_invoices
    SET total_amount = COALESCE((SELECT SUM(line_total) FROM public.purchase_invoice_items WHERE invoice_id = _invoice_id), 0),
        updated_at = now()
    WHERE id = _invoice_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_update_invoice_total
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.update_invoice_total();

-- 5) Trigger: block edits on posted invoices
CREATE OR REPLACE FUNCTION public.block_posted_invoice_edit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  -- Allow the posting update itself (draft->posted)
  IF TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'posted' THEN
    RETURN NEW;
  END IF;
  -- Allow total_amount updates on posted (from item trigger)
  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' AND NEW.status = 'posted'
     AND OLD.invoice_number = NEW.invoice_number AND OLD.supplier_name IS NOT DISTINCT FROM NEW.supplier_name
     AND OLD.invoice_date = NEW.invoice_date THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION 'No se puede modificar una factura posteada';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_block_posted_invoice
BEFORE UPDATE OR DELETE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.block_posted_invoice_edit();

-- 6) Trigger: block item changes on posted invoices
CREATE OR REPLACE FUNCTION public.block_posted_invoice_item_edit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = 'public' AS $$
DECLARE _status text;
BEGIN
  SELECT status INTO _status FROM public.purchase_invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF _status = 'posted' THEN
    RAISE EXCEPTION 'No se pueden modificar ítems de una factura posteada';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_block_posted_item
BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.block_posted_invoice_item_edit();

-- 7) Validation trigger for quantity/unit_cost > 0
CREATE OR REPLACE FUNCTION public.validate_invoice_item()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = 'public' AS $$
BEGIN
  IF NEW.quantity <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a 0'; END IF;
  IF NEW.unit_cost <= 0 THEN RAISE EXCEPTION 'El costo unitario debe ser mayor a 0'; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_invoice_item
BEFORE INSERT OR UPDATE ON public.purchase_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_item();

-- 8) RLS for purchase_invoices
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view invoices"
ON public.purchase_invoices FOR SELECT
USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage draft invoices"
ON public.purchase_invoices FOR INSERT
WITH CHECK (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')));

CREATE POLICY "Admin and bodega can update invoices"
ON public.purchase_invoices FOR UPDATE
USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')));

CREATE POLICY "Admin can delete draft invoices"
ON public.purchase_invoices FOR DELETE
USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin') AND status = 'draft');

-- 9) RLS for purchase_invoice_items
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view invoice items"
ON public.purchase_invoice_items FOR SELECT
USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage invoice items"
ON public.purchase_invoice_items FOR ALL
USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
WITH CHECK (restaurant_id = get_my_restaurant_id());

-- 10) updated_at trigger for invoices
CREATE TRIGGER update_purchase_invoices_updated_at
BEFORE UPDATE ON public.purchase_invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 11) System function for permissions
INSERT INTO public.system_functions (key, label, description, category, sort_order)
VALUES ('purchases', 'Compras / Facturas', 'Ver y gestionar facturas de compra', 'inventario', 15);

INSERT INTO public.system_functions (key, label, description, category, sort_order)
VALUES ('purchases_create', 'Crear Facturas', 'Crear y editar facturas de compra', 'inventario', 16);

INSERT INTO public.system_functions (key, label, description, category, sort_order)
VALUES ('purchases_post', 'Postear Facturas', 'Confirmar facturas y generar entradas', 'inventario', 17);

INSERT INTO public.system_functions (key, label, description, category, sort_order)
VALUES ('purchases_delete', 'Eliminar Facturas', 'Eliminar facturas en borrador', 'inventario', 18);

-- 12) Grant permissions to admin and bodega roles
INSERT INTO public.role_permissions (role, function_key) VALUES ('admin', 'purchases');
INSERT INTO public.role_permissions (role, function_key) VALUES ('admin', 'purchases_create');
INSERT INTO public.role_permissions (role, function_key) VALUES ('admin', 'purchases_post');
INSERT INTO public.role_permissions (role, function_key) VALUES ('admin', 'purchases_delete');
INSERT INTO public.role_permissions (role, function_key) VALUES ('bodega', 'purchases');
INSERT INTO public.role_permissions (role, function_key) VALUES ('bodega', 'purchases_create');
INSERT INTO public.role_permissions (role, function_key) VALUES ('bodega', 'purchases_post');
