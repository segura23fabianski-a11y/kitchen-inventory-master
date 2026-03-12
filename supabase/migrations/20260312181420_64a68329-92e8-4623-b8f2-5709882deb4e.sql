
INSERT INTO public.system_functions (key, label, category) VALUES
  ('cash_open', 'Abrir caja', 'POS'),
  ('cash_close', 'Cerrar caja', 'POS'),
  ('cash_register_view', 'Ver historial de caja', 'POS'),
  ('cash_reconciliation_view', 'Ver conciliación de caja (montos esperados)', 'POS'),
  ('cash_reconciliation_admin', 'Administrar auditoría de caja', 'POS')
ON CONFLICT (key) DO NOTHING;
