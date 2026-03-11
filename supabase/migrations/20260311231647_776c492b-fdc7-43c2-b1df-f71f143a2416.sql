
-- Add damaged column to hotel_linen_inventory
ALTER TABLE public.hotel_linen_inventory ADD COLUMN IF NOT EXISTS damaged integer NOT NULL DEFAULT 0;

-- Update categories to better reflect hotel textiles
COMMENT ON TABLE public.hotel_linen_inventory IS 'Inventario de textiles y dotación hotelera reutilizable. Columnas de ubicación: available=en bodega, in_use=en habitaciones, in_laundry=en lavandería, damaged=dañados';
