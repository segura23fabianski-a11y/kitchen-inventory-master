-- Normalize categories in system_functions
UPDATE system_functions SET category = 'Administración' WHERE category = 'admin';
UPDATE system_functions SET category = 'Hotel' WHERE category = 'hotel';
UPDATE system_functions SET category = 'Compras' WHERE category = 'compras';
UPDATE system_functions SET category = 'Inventario' WHERE category = 'inventario';
UPDATE system_functions SET category = 'Operación' WHERE category = 'operacion';