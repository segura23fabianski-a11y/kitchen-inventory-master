
-- Habilitar RLS en tablas de backup
ALTER TABLE public.backup_inventory_movements_20260311 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_products_20260311 ENABLE ROW LEVEL SECURITY;

-- Solo admins pueden ver los backups
CREATE POLICY "Admin can view backup movements" ON public.backup_inventory_movements_20260311
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can view backup products" ON public.backup_products_20260311
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'));
