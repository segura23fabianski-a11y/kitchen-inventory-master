ALTER TABLE public.stay_guests
  ADD COLUMN shift_label text DEFAULT NULL,
  ADD COLUMN shift_start time DEFAULT NULL,
  ADD COLUMN shift_end time DEFAULT NULL;