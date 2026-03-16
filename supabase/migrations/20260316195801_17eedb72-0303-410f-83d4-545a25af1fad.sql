
ALTER TABLE public.room_types
ADD COLUMN IF NOT EXISTS rate_single numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS rate_double numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS rate_triple numeric NOT NULL DEFAULT 0;

UPDATE public.room_types SET rate_single = base_rate WHERE rate_single = 0 AND base_rate > 0;
