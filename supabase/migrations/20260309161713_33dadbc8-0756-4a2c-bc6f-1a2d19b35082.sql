
-- Suppliers table
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  name TEXT NOT NULL,
  nit TEXT NULL,
  contact_name TEXT NULL,
  phone TEXT NULL,
  email TEXT NULL,
  notes TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view suppliers" ON public.suppliers
  FOR SELECT TO public USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage suppliers" ON public.suppliers
  FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Product-Supplier relationship
CREATE TABLE public.product_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_product_code TEXT NULL,
  last_unit_cost NUMERIC NULL,
  purchase_unit TEXT NULL,
  minimum_order_qty NUMERIC NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, product_id, supplier_id)
);

ALTER TABLE public.product_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view product_suppliers" ON public.product_suppliers
  FOR SELECT TO public USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage product_suppliers" ON public.product_suppliers
  FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Purchase Orders
CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','received')),
  notes TEXT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view purchase_orders" ON public.purchase_orders
  FOR SELECT TO public USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage purchase_orders" ON public.purchase_orders
  FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Purchase Order Items
CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view purchase_order_items" ON public.purchase_order_items
  FOR SELECT TO public USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage purchase_order_items" ON public.purchase_order_items
  FOR ALL TO public
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- System functions for permissions
INSERT INTO public.system_functions (key, label, category, sort_order) VALUES
  ('suppliers', 'Ver Proveedores', 'compras', 50),
  ('suppliers_create', 'Crear/Editar Proveedores', 'compras', 51),
  ('purchase_orders', 'Ver Pedidos de Compra', 'compras', 52),
  ('purchase_orders_create', 'Crear Pedidos de Compra', 'compras', 53);

-- Assign permissions to admin and bodega roles
INSERT INTO public.role_permissions (role, function_key) VALUES
  ('admin', 'suppliers'),
  ('admin', 'suppliers_create'),
  ('admin', 'purchase_orders'),
  ('admin', 'purchase_orders_create'),
  ('bodega', 'suppliers'),
  ('bodega', 'suppliers_create'),
  ('bodega', 'purchase_orders'),
  ('bodega', 'purchase_orders_create');
