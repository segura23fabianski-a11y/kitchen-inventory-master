
-- 1) Meal Components (configurable by restaurant)
CREATE TABLE public.meal_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view meal_components" ON public.meal_components
  FOR SELECT USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage meal_components" ON public.meal_components
  FOR ALL USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- 2) Meal Plans
CREATE TABLE public.meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view meal_plans" ON public.meal_plans
  FOR SELECT USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage meal_plans" ON public.meal_plans
  FOR ALL USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- 3) Meal Plan Services (one per day+service_type)
CREATE TABLE public.meal_plan_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  service_type TEXT NOT NULL,
  projected_servings NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_plan_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view meal_plan_services" ON public.meal_plan_services
  FOR SELECT USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage meal_plan_services" ON public.meal_plan_services
  FOR ALL USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

-- 4) Meal Plan Service Items (component + recipe per service)
CREATE TABLE public.meal_plan_service_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_service_id UUID NOT NULL REFERENCES public.meal_plan_services(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.meal_components(id),
  recipe_id UUID NOT NULL REFERENCES public.recipes(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_plan_service_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view meal_plan_service_items" ON public.meal_plan_service_items
  FOR SELECT USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));

CREATE POLICY "Admin and bodega can manage meal_plan_service_items" ON public.meal_plan_service_items
  FOR ALL USING (restaurant_id = get_my_restaurant_id() AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'bodega')))
  WITH CHECK (restaurant_id = get_my_restaurant_id());
