
-- Contracts table (e.g. RIC 23, RIC 36)
CREATE TABLE public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.hotel_companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contracts_restaurant ON public.contracts(restaurant_id);
CREATE INDEX idx_contracts_company ON public.contracts(company_id);

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view contracts"
ON public.contracts FOR SELECT TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Admin can manage contracts"
ON public.contracts FOR ALL TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_role(auth.uid(), 'admin'))
WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Contract groups table (e.g. staff, cuadrilla, SierraCol)
CREATE TABLE public.contract_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  name text NOT NULL,
  group_type text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contract_groups_restaurant ON public.contract_groups(restaurant_id);
CREATE INDEX idx_contract_groups_contract ON public.contract_groups(contract_id);

ALTER TABLE public.contract_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view contract_groups"
ON public.contract_groups FOR SELECT TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));

CREATE POLICY "Admin can manage contract_groups"
ON public.contract_groups FOR ALL TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_role(auth.uid(), 'admin'))
WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Add contract hierarchy to pos_orders
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contract_group_id uuid REFERENCES public.contract_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_pos_orders_contract ON public.pos_orders(contract_id);
CREATE INDEX idx_pos_orders_contract_group ON public.pos_orders(contract_group_id);
