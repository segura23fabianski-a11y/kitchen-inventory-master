
-- ============================================================
-- DROP ALL EXISTING POLICIES
-- ============================================================

-- restaurants
DROP POLICY IF EXISTS "Users can view their own restaurant" ON public.restaurants;
DROP POLICY IF EXISTS "Admins can manage their restaurant" ON public.restaurants;

-- profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view tenant profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- products
DROP POLICY IF EXISTS "Tenant users can view products" ON public.products;
DROP POLICY IF EXISTS "Admins and bodega can manage tenant products" ON public.products;

-- categories
DROP POLICY IF EXISTS "Tenant users can view categories" ON public.categories;
DROP POLICY IF EXISTS "Admins can manage tenant categories" ON public.categories;
DROP POLICY IF EXISTS "Bodega can manage tenant categories" ON public.categories;

-- recipes
DROP POLICY IF EXISTS "Tenant users can view recipes" ON public.recipes;
DROP POLICY IF EXISTS "Admins can manage tenant recipes" ON public.recipes;
DROP POLICY IF EXISTS "Bodega can manage tenant recipes" ON public.recipes;

-- recipe_ingredients
DROP POLICY IF EXISTS "Tenant users can view recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Admins can manage tenant recipe ingredients" ON public.recipe_ingredients;
DROP POLICY IF EXISTS "Bodega can manage tenant recipe ingredients" ON public.recipe_ingredients;

-- warehouses
DROP POLICY IF EXISTS "Tenant users can view warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Admins can manage tenant warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "Bodega can manage tenant warehouses" ON public.warehouses;

-- inventory_movements
DROP POLICY IF EXISTS "Tenant users can view movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Tenant users can insert movements" ON public.inventory_movements;
DROP POLICY IF EXISTS "Admins can delete tenant movements" ON public.inventory_movements;

-- user_roles
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

-- role_permissions
DROP POLICY IF EXISTS "Admins can manage role permissions" ON public.role_permissions;
DROP POLICY IF EXISTS "Admins can view role permissions" ON public.role_permissions;

-- system_functions
DROP POLICY IF EXISTS "Authenticated users can view system functions" ON public.system_functions;
DROP POLICY IF EXISTS "Admins can manage system functions" ON public.system_functions;

-- ============================================================
-- ENSURE RLS IS ENABLED ON ALL TABLES
-- ============================================================
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_functions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 1) RESTAURANTS
-- ============================================================
CREATE POLICY "Authenticated users can view own restaurant"
  ON public.restaurants FOR SELECT TO authenticated
  USING (id = get_my_restaurant_id());

CREATE POLICY "Admins can manage own restaurant"
  ON public.restaurants FOR ALL TO authenticated
  USING (id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 2) PROFILES
-- ============================================================
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view tenant profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 3) PRODUCTS
-- ============================================================
CREATE POLICY "Authenticated tenant users can view products"
  ON public.products FOR SELECT TO authenticated
  USING (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Admin and bodega can manage tenant products"
  ON public.products FOR ALL TO authenticated
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'bodega'::app_role)))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- ============================================================
-- 4) CATEGORIES
-- ============================================================
CREATE POLICY "Authenticated tenant users can view categories"
  ON public.categories FOR SELECT TO authenticated
  USING (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Admin and bodega can manage tenant categories"
  ON public.categories FOR ALL TO authenticated
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'bodega'::app_role)))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- ============================================================
-- 5) RECIPES
-- ============================================================
CREATE POLICY "Authenticated tenant users can view recipes"
  ON public.recipes FOR SELECT TO authenticated
  USING (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Admin and bodega can manage tenant recipes"
  ON public.recipes FOR ALL TO authenticated
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'bodega'::app_role)))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- ============================================================
-- 6) RECIPE_INGREDIENTS
-- ============================================================
CREATE POLICY "Authenticated tenant users can view recipe ingredients"
  ON public.recipe_ingredients FOR SELECT TO authenticated
  USING (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Admin and bodega can manage tenant recipe ingredients"
  ON public.recipe_ingredients FOR ALL TO authenticated
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'bodega'::app_role)))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- ============================================================
-- 7) WAREHOUSES
-- ============================================================
CREATE POLICY "Authenticated tenant users can view warehouses"
  ON public.warehouses FOR SELECT TO authenticated
  USING (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Admin and bodega can manage tenant warehouses"
  ON public.warehouses FOR ALL TO authenticated
  USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'bodega'::app_role)))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- ============================================================
-- 8) INVENTORY_MOVEMENTS
-- ============================================================
CREATE POLICY "Authenticated tenant users can view movements"
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Authenticated tenant users can insert movements"
  ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = get_my_restaurant_id() AND auth.uid() = user_id);

CREATE POLICY "Admins can delete tenant movements"
  ON public.inventory_movements FOR DELETE TO authenticated
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'::app_role));

-- No UPDATE policy = UPDATE disabled

-- ============================================================
-- 9) USER_ROLES
-- ============================================================
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 10) ROLE_PERMISSIONS (solo authenticated, admin gestiona)
-- ============================================================
CREATE POLICY "Authenticated admins can view role permissions"
  ON public.role_permissions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage role permissions"
  ON public.role_permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 11) SYSTEM_FUNCTIONS (authenticated puede ver, admin gestiona)
-- ============================================================
CREATE POLICY "Authenticated users can view system functions"
  ON public.system_functions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage system functions"
  ON public.system_functions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
