-- Add contract_id to stays for corporate billing/reporting
ALTER TABLE public.stays ADD COLUMN contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL;

-- Add index for reporting queries
CREATE INDEX idx_stays_contract_id ON public.stays(contract_id);
