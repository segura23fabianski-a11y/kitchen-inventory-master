
ALTER TABLE public.purchase_invoices
ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id);
