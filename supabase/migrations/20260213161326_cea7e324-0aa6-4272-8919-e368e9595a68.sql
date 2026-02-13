
-- =============================================
-- A) Add status & approved_at to profiles, make restaurant_id nullable
-- =============================================
ALTER TABLE public.profiles ALTER COLUMN restaurant_id DROP NOT NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL;

-- Set existing profiles to 'active' so current users aren't locked out
UPDATE public.profiles SET status = 'active' WHERE status = 'pending';

-- =============================================
-- B) Update handle_new_user trigger function
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, restaurant_id, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NULL,
    'pending'
  );
  RETURN NEW;
END;
$$;

-- =============================================
-- C) Update get_my_restaurant_id to require active status
-- =============================================
CREATE OR REPLACE FUNCTION public.get_my_restaurant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT restaurant_id 
  FROM public.profiles 
  WHERE user_id = auth.uid() 
    AND status = 'active'
    AND restaurant_id IS NOT NULL
  LIMIT 1
$$;

-- =============================================
-- D) Harden RLS on all business tables
-- =============================================

-- Helper: drop all existing policies on a table
-- PRODUCTS
DROP POLICY IF EXISTS "Authenticated tenant users can view products" ON public.products;
DROP POLICY IF EXISTS "Admin and bodega can manage tenant products" ON public.products;

CREATE POLICY "Active tenant users can view products"
ON public.products FOR SELECT TO authenticated
USING (
  restaurant_id = get_my_restaurant_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'bodega'::app_role)
    OR has_role(auth.uid(), 'cocina'::app_role)
  )
);

CREATE POLICY "Admin and bodega can manage tenant products"
ON public.products FOR ALL TO authenticated
USING (
  restaurant_id = get_my_restaurant_id()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'bodega'::app_role))
)
WITH CHECK (
  restaurant_id = get_my_restaurant_id()
);

-- CATEGORIES
DROP POLICY IF EXISTS "Authenticated tenant users can view categories" ON public.categories;
DROP POLICY IF EXISTS "Admin and bodega can manage tenant categories" ON public.categories;

CREATE POLICY "Active tenant users can view categories"
ON public.categories FOR SELECT TO authenticated
USING (
  restaurant_id = get_my_restaurant_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'bodega'::app_role)
    OR has_role(auth.uid(), 'cocina'::app_role)
  )
);

CREATE POLICY "Admin and bodega can manage tenant categories"
ON public.categories FOR ALL TO authenticated
USING (
  restaurant_id = get_my_restaurant_id()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'bodega'::app_role))
)
WITH CHECK (restaurant_id = get_my_restaurant_id());

-- RECIPES
DROP POLICY IF EXISTS "Authenticated tenant users can view recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admin and bodega can manage tenant recipes" ON public.recipes;

CREATE POLICY "Active tenant users can view recipes"
ON public.recipes FOR SELECT TO authenticated
USING (
  restaurant_id = get_my_restaurant_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'bodega'::app_role)
    OR has_role(auth.uid(), 'cocina'::app_role)
  )
);

CREATE POLICY "Admin and bodega can manage tenant recipes"
ON public.recipes FOR ALL TO authenticated
USING (
  restaurant_id = get_my_restaurant_id()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'bodega'::app_role))
)
WITH CHECK (restaurant_id = get_my_restaurant_id());

-- RECIPE_INGREDIENTS
DROP POLICY IF EXISTS "Authenticated tenant users can view recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Admin and bodega can manage tenant recipe ingredients" ON public.recipe_ingredients;

CREATE POLICY "Active tenant users can view recipe ingredients"
ON public.recipe_ingredients FOR SELECT TO authenticated
USING (
  restaurant_id = get_my_restaurant_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'bodega'::app_role)
    OR has_role(auth.uid(), 'cocina'::app_role)
  )
);

CREATE POLICY "Admin and bodega can manage tenant recipe ingredients"
ON public.recipe_ingredients FOR ALL TO authenticated
USING (
  restaurant_id = get_my_restaurant_id()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'bodega'::app_role))
)
WITH CHECK (restaurant_id = get_my_restaurant_id());

-- WAREHOUSES
DROP POLICY IF EXISTS "Authenticated tenant users can view warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Admin and bodega can manage tenant warehouses" ON public.warehouses;

CREATE POLICY "Active tenant users can view warehouses"
ON public.warehouses FOR SELECT TO authenticated
USING (
  restaurant_id = get_my_restaurant_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'bodega'::app_role)
    OR has_role(auth.uid(), 'cocina'::app_role)
  )
);

CREATE POLICY "Admin and bodega can manage tenant warehouses"
ON public.warehouses FOR ALL TO authenticated
USING (
  restaurant_id = get_my_restaurant_id()
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'bodega'::app_role))
)
WITH CHECK (restaurant_id = get_my_restaurant_id());

-- INVENTORY_MOVEMENTS
DROP POLICY IF EXISTS "Authenticated tenant users can view movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Authenticated tenant users can insert movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Admins can delete tenant movements" ON public.inventory_movements;

CREATE POLICY "Active tenant users can view movements"
ON public.inventory_movements FOR SELECT TO authenticated
USING (
  restaurant_id = get_my_restaurant_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'bodega'::app_role)
    OR has_role(auth.uid(), 'cocina'::app_role)
  )
);

CREATE POLICY "Active tenant users can insert movements"
ON public.inventory_movements FOR INSERT TO authenticated
WITH CHECK (
  restaurant_id = get_my_restaurant_id()
  AND auth.uid() = user_id
);

CREATE POLICY "Admins can delete tenant movements"
ON public.inventory_movements FOR DELETE TO authenticated
USING (
  restaurant_id = get_my_restaurant_id()
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- RESTAURANTS
DROP POLICY IF EXISTS "Authenticated users can view own restaurant" ON public.restaurants;
DROP POLICY IF EXISTS "Admins can manage own restaurant" ON public.restaurants;

CREATE POLICY "Active users can view own restaurant"
ON public.restaurants FOR SELECT TO authenticated
USING (
  id = get_my_restaurant_id()
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'bodega'::app_role)
    OR has_role(auth.uid(), 'cocina'::app_role)
  )
);

CREATE POLICY "Admins can manage own restaurant"
ON public.restaurants FOR ALL TO authenticated
USING (id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- E) Update PROFILES RLS for admin approval flow
-- =============================================
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view tenant profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Users can always see their own profile (even if pending, so the app can show status)
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Admins can see all profiles in their restaurant (active ones) AND pending profiles (no restaurant yet)
CREATE POLICY "Admins can view tenant and pending profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    restaurant_id = get_my_restaurant_id()
    OR (status = 'pending' AND restaurant_id IS NULL)
  )
);

-- Trigger handles insert, but keep policy for safety
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can update their own active profile (name etc)
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status = 'active')
WITH CHECK (auth.uid() = user_id);

-- Admins can update profiles to approve/block users
CREATE POLICY "Admins can update profiles for approval"
ON public.profiles FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    restaurant_id = get_my_restaurant_id()
    OR (status = 'pending' AND restaurant_id IS NULL)
  )
);
