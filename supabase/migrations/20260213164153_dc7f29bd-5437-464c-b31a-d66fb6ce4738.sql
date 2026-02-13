
-- Step 1: Drop ALL RLS policies that reference app_role enum

-- categories
DROP POLICY IF EXISTS "Active tenant users can view categories" ON public.categories;
DROP POLICY IF EXISTS "Admin and bodega can manage tenant categories" ON public.categories;
-- inventory_movements
DROP POLICY IF EXISTS "Active tenant users can view movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Active tenant users can insert movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Admins can delete tenant movements" ON public.inventory_movements;
-- products
DROP POLICY IF EXISTS "Active tenant users can view products" ON public.products;
DROP POLICY IF EXISTS "Admin and bodega can manage tenant products" ON public.products;
-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view tenant and pending profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update profiles for approval" ON public.profiles;
DROP POLICY IF EXISTS "Admins can delete tenant profiles" ON public.profiles;
-- recipe_ingredients
DROP POLICY IF EXISTS "Active tenant users can view recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Admin and bodega can manage tenant recipe ingredients" ON public.recipe_ingredients;
-- recipes
DROP POLICY IF EXISTS "Active tenant users can view recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admin and bodega can manage tenant recipes" ON public.recipes;
-- restaurants
DROP POLICY IF EXISTS "Active users can view own restaurant" ON public.restaurants;
DROP POLICY IF EXISTS "Admins can manage own restaurant" ON public.restaurants;
-- role_permissions
DROP POLICY IF EXISTS "Authenticated admins can view role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Admins can manage role permissions" ON public.role_permissions;
-- system_functions
DROP POLICY IF EXISTS "Authenticated users can view system functions" ON public.system_functions;
DROP POLICY IF EXISTS "Admins can manage system functions" ON public.system_functions;
-- user_roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
-- warehouses
DROP POLICY IF EXISTS "Active tenant users can view warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Admin and bodega can manage tenant warehouses" ON public.warehouses;

-- Step 2: Drop has_role function (depends on enum)
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);

-- Step 3: Alter columns from app_role enum to text
ALTER TABLE public.user_roles ALTER COLUMN role TYPE text USING role::text;
ALTER TABLE public.role_permissions ALTER COLUMN role TYPE text USING role::text;

-- Step 4: Drop the enum
DROP TYPE IF EXISTS public.app_role;

-- Step 5: Recreate has_role with text parameter
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id
  )
$$;

-- Step 6: Create roles table
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  label text NOT NULL,
  description text DEFAULT '',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

INSERT INTO public.roles (name, label, description, is_system) VALUES
  ('admin', 'Administrador', 'Acceso completo al sistema', true),
  ('cocina', 'Cocina', 'Gestión de recetas y consumos', true),
  ('bodega', 'Bodega', 'Gestión de inventario y productos', true);

CREATE POLICY "Authenticated users can view roles"
  ON public.roles FOR SELECT USING (true);

CREATE POLICY "Admins can manage roles"
  ON public.roles FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

-- Step 7: Recreate ALL RLS policies (no enum casts)

-- categories
CREATE POLICY "Active tenant users can view categories"
  ON public.categories FOR SELECT
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admin and bodega can manage tenant categories"
  ON public.categories FOR ALL
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- inventory_movements
CREATE POLICY "Active tenant users can view movements"
  ON public.inventory_movements FOR SELECT
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Active tenant users can insert movements"
  ON public.inventory_movements FOR INSERT
  WITH CHECK (restaurant_id = get_my_restaurant_id() AND auth.uid() = user_id);
CREATE POLICY "Admins can delete tenant movements"
  ON public.inventory_movements FOR DELETE
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'));

-- products
CREATE POLICY "Active tenant users can view products"
  ON public.products FOR SELECT
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admin and bodega can manage tenant products"
  ON public.products FOR ALL
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view tenant and pending profiles"
  ON public.profiles FOR SELECT
  USING (has_role(auth.uid(), 'admin') AND (restaurant_id = get_my_restaurant_id() OR (status = 'pending' AND restaurant_id IS NULL)));
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id AND status = 'active') WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can update profiles for approval"
  ON public.profiles FOR UPDATE
  USING (has_role(auth.uid(), 'admin') AND (restaurant_id = get_my_restaurant_id() OR (status = 'pending' AND restaurant_id IS NULL)));
CREATE POLICY "Admins can delete tenant profiles"
  ON public.profiles FOR DELETE
  USING (has_role(auth.uid(), 'admin') AND (restaurant_id = get_my_restaurant_id() OR (status = 'pending' AND restaurant_id IS NULL)));

-- recipe_ingredients
CREATE POLICY "Active tenant users can view recipe ingredients"
  ON public.recipe_ingredients FOR SELECT
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admin and bodega can manage tenant recipe ingredients"
  ON public.recipe_ingredients FOR ALL
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- recipes
CREATE POLICY "Active tenant users can view recipes"
  ON public.recipes FOR SELECT
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admin and bodega can manage tenant recipes"
  ON public.recipes FOR ALL
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- restaurants
CREATE POLICY "Active users can view own restaurant"
  ON public.restaurants FOR SELECT
  USING (id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admins can manage own restaurant"
  ON public.restaurants FOR ALL
  USING (id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'));

-- role_permissions
CREATE POLICY "Authenticated users can view role permissions"
  ON public.role_permissions FOR SELECT USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage role permissions"
  ON public.role_permissions FOR ALL
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- system_functions
CREATE POLICY "Authenticated users can view system functions"
  ON public.system_functions FOR SELECT USING (true);
CREATE POLICY "Admins can manage system functions"
  ON public.system_functions FOR ALL
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

-- warehouses
CREATE POLICY "Active tenant users can view warehouses"
  ON public.warehouses FOR SELECT
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admin and bodega can manage tenant warehouses"
  ON public.warehouses FOR ALL
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());
