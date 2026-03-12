INSERT INTO role_permissions (role, function_key) VALUES 
('admin', 'cash_open'),
('admin', 'cash_close'),
('admin', 'cash_register_view'),
('admin', 'cash_reconciliation_view'),
('admin', 'cash_reconciliation_admin')
ON CONFLICT DO NOTHING;