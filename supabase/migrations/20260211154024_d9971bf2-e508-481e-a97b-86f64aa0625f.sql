
-- System functions registry
CREATE TABLE public.system_functions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.system_functions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view system functions" ON public.system_functions FOR SELECT USING (true);
CREATE POLICY "Admins can manage system functions" ON public.system_functions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Role permissions mapping
CREATE TABLE public.role_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role app_role NOT NULL,
  function_key TEXT NOT NULL REFERENCES public.system_functions(key) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(role, function_key)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view role permissions" ON public.role_permissions FOR SELECT USING (true);
CREATE POLICY "Admins can manage role permissions" ON public.role_permissions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed current system functions
INSERT INTO public.system_functions (key, label, description, category, sort_order) VALUES
  ('dashboard', 'Dashboard', 'Ver panel principal con resumen e indicadores', 'General', 1),
  ('products', 'Productos', 'Crear, editar y ver productos del inventario', 'Inventario', 2),
  ('categories', 'Categorías', 'Gestionar categorías de productos', 'Inventario', 3),
  ('movements', 'Movimientos', 'Registrar entradas, salidas y ajustes de inventario', 'Inventario', 4),
  ('recipes', 'Recetas', 'Crear y gestionar recetas con ingredientes y costos', 'Producción', 5),
  ('kitchen_kiosk', 'Kiosco Cocina', 'Registrar consumos de ingredientes por receta', 'Producción', 6),
  ('reports', 'Reportes', 'Ver reportes de consumo y costos por receta', 'Análisis', 7),
  ('users', 'Usuarios', 'Crear usuarios y asignar roles', 'Administración', 8),
  ('roles', 'Roles y Permisos', 'Gestionar permisos de cada rol', 'Administración', 9);

-- Seed default permissions for each role
-- Admin: all
INSERT INTO public.role_permissions (role, function_key)
SELECT 'admin'::app_role, key FROM public.system_functions;

-- Bodega: products, categories, movements, recipes, dashboard
INSERT INTO public.role_permissions (role, function_key) VALUES
  ('bodega', 'dashboard'),
  ('bodega', 'products'),
  ('bodega', 'categories'),
  ('bodega', 'movements'),
  ('bodega', 'recipes');

-- Cocina: dashboard, movements, kitchen_kiosk, recipes (view)
INSERT INTO public.role_permissions (role, function_key) VALUES
  ('cocina', 'dashboard'),
  ('cocina', 'movements'),
  ('cocina', 'kitchen_kiosk'),
  ('cocina', 'recipes');
