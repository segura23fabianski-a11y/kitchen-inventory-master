
-- 1. Create restaurants table
CREATE TABLE public.restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

-- 2. Insert a default restaurant for existing data
INSERT INTO public.restaurants (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Restaurante Principal');

-- 3. Add restaurant_id columns (nullable first for safe migration)
ALTER TABLE public.profiles ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.categories ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_movements ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.recipes ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.recipe_ingredients ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.warehouses ADD COLUMN restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE;

-- 4. Backfill existing data with the default restaurant
UPDATE public.profiles SET restaurant_id = '00000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.products SET restaurant_id = '00000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.categories SET restaurant_id = '00000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.inventory_movements SET restaurant_id = '00000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.recipes SET restaurant_id = '00000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.recipe_ingredients SET restaurant_id = '00000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;
UPDATE public.warehouses SET restaurant_id = '00000000-0000-0000-0000-000000000001' WHERE restaurant_id IS NULL;

-- 5. Make restaurant_id NOT NULL after backfill
ALTER TABLE public.profiles ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.products ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.categories ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.inventory_movements ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.recipes ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.recipe_ingredients ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE public.warehouses ALTER COLUMN restaurant_id SET NOT NULL;

-- 6. Create security definer function to get current user's restaurant_id (avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.get_my_restaurant_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT restaurant_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- 7. RLS for restaurants table
CREATE POLICY "Users can view their own restaurant"
  ON public.restaurants FOR SELECT
  USING (id = public.get_my_restaurant_id());

CREATE POLICY "Admins can manage their restaurant"
  ON public.restaurants FOR ALL
  USING (id = public.get_my_restaurant_id() AND public.has_role(auth.uid(), 'admin'));

-- 8. Drop existing RLS policies and recreate with tenant isolation

-- PROFILES
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view tenant profiles"
  ON public.profiles FOR SELECT
  USING (restaurant_id = public.get_my_restaurant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- PRODUCTS
DROP POLICY IF EXISTS "Admins and bodega can manage products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;

CREATE POLICY "Tenant users can view products"
  ON public.products FOR SELECT
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "Admins and bodega can manage tenant products"
  ON public.products FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id() AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'bodega')));

-- CATEGORIES
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated users can view categories" ON public.categories;
DROP POLICY IF EXISTS "Bodega can manage categories" ON public.categories;

CREATE POLICY "Tenant users can view categories"
  ON public.categories FOR SELECT
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "Admins can manage tenant categories"
  ON public.categories FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Bodega can manage tenant categories"
  ON public.categories FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id() AND public.has_role(auth.uid(), 'bodega'));

-- INVENTORY_MOVEMENTS
DROP POLICY IF EXISTS "Admins can delete movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Authenticated users can insert movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Authenticated users can view movements" ON public.inventory_movements;

CREATE POLICY "Tenant users can view movements"
  ON public.inventory_movements FOR SELECT
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "Tenant users can insert movements"
  ON public.inventory_movements FOR INSERT
  WITH CHECK (restaurant_id = public.get_my_restaurant_id() AND auth.uid() = user_id);

CREATE POLICY "Admins can delete tenant movements"
  ON public.inventory_movements FOR DELETE
  USING (restaurant_id = public.get_my_restaurant_id() AND public.has_role(auth.uid(), 'admin'));

-- RECIPES
DROP POLICY IF EXISTS "Admins can manage recipes" ON public.recipes;
DROP POLICY IF EXISTS "Authenticated users can view recipes" ON public.recipes;
DROP POLICY IF EXISTS "Bodega can manage recipes" ON public.recipes;

CREATE POLICY "Tenant users can view recipes"
  ON public.recipes FOR SELECT
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "Admins can manage tenant recipes"
  ON public.recipes FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Bodega can manage tenant recipes"
  ON public.recipes FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id() AND public.has_role(auth.uid(), 'bodega'));

-- RECIPE_INGREDIENTS
DROP POLICY IF EXISTS "Admins can manage recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Authenticated users can view recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Bodega can manage recipe ingredients" ON public.recipe_ingredients;

CREATE POLICY "Tenant users can view recipe ingredients"
  ON public.recipe_ingredients FOR SELECT
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "Admins can manage tenant recipe ingredients"
  ON public.recipe_ingredients FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Bodega can manage tenant recipe ingredients"
  ON public.recipe_ingredients FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id() AND public.has_role(auth.uid(), 'bodega'));

-- WAREHOUSES
DROP POLICY IF EXISTS "Admins can manage warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Authenticated users can view warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Bodega can manage warehouses" ON public.warehouses;

CREATE POLICY "Tenant users can view warehouses"
  ON public.warehouses FOR SELECT
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "Admins can manage tenant warehouses"
  ON public.warehouses FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id() AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Bodega can manage tenant warehouses"
  ON public.warehouses FOR ALL
  USING (restaurant_id = public.get_my_restaurant_id() AND public.has_role(auth.uid(), 'bodega'));

-- 9. Update handle_new_user trigger to set restaurant_id from metadata (for future tenant onboarding)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, restaurant_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE((NEW.raw_user_meta_data->>'restaurant_id')::uuid, '00000000-0000-0000-0000-000000000001')
  );
  RETURN NEW;
END;
$$;

-- 10. Add indexes for performance
CREATE INDEX idx_profiles_restaurant ON public.profiles(restaurant_id);
CREATE INDEX idx_products_restaurant ON public.products(restaurant_id);
CREATE INDEX idx_categories_restaurant ON public.categories(restaurant_id);
CREATE INDEX idx_movements_restaurant ON public.inventory_movements(restaurant_id);
CREATE INDEX idx_recipes_restaurant ON public.recipes(restaurant_id);
CREATE INDEX idx_recipe_ingredients_restaurant ON public.recipe_ingredients(restaurant_id);
CREATE INDEX idx_warehouses_restaurant ON public.warehouses(restaurant_id);
