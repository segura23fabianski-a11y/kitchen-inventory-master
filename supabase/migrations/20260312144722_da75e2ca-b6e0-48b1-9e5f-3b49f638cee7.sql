
-- Service rates table for POS food service pricing
CREATE TABLE public.service_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.hotel_companies(id) ON DELETE CASCADE,
  consumption_mode text NOT NULL DEFAULT 'dine_in',
  price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  effective_from date,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_consumption_mode CHECK (consumption_mode IN ('dine_in', 'takeaway', 'corporate_charge'))
);

-- Indexes
CREATE INDEX idx_service_rates_restaurant ON public.service_rates(restaurant_id);
CREATE INDEX idx_service_rates_menu_item ON public.service_rates(menu_item_id);
CREATE INDEX idx_service_rates_company ON public.service_rates(company_id);
CREATE INDEX idx_service_rates_lookup ON public.service_rates(restaurant_id, menu_item_id, consumption_mode, active);

-- RLS
ALTER TABLE public.service_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view service_rates"
ON public.service_rates FOR SELECT TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Admin can manage service_rates"
ON public.service_rates FOR ALL TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_role(auth.uid(), 'admin'))
WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Add rate tracking to pos_order_items
ALTER TABLE public.pos_order_items
  ADD COLUMN IF NOT EXISTS rate_applied numeric,
  ADD COLUMN IF NOT EXISTS rate_source text NOT NULL DEFAULT 'menu_base';
