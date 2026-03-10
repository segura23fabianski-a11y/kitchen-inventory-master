
ALTER TABLE public.recipes
  ADD COLUMN recipe_type TEXT NOT NULL DEFAULT 'food' CHECK (recipe_type IN ('food', 'laundry', 'housekeeping'));
