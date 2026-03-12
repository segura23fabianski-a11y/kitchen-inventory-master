
-- Contract service rates: pricing per service type (breakfast, lunch, dinner, snack) by company/contract
CREATE TABLE public.contract_service_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id),
  company_id UUID NOT NULL REFERENCES public.hotel_companies(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL DEFAULT 'lunch',
  rate NUMERIC NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(company_id, contract_id, service_type)
);

-- Enable RLS
ALTER TABLE public.contract_service_rates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admin can manage contract_service_rates"
  ON public.contract_service_rates
  FOR ALL
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin'))
  WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view contract_service_rates"
  ON public.contract_service_rates
  FOR SELECT
  TO public
  USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
