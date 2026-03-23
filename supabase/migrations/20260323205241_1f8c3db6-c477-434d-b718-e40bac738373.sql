
ALTER TABLE public.smart_invoices 
  ADD COLUMN IF NOT EXISTS xml_url text,
  ADD COLUMN IF NOT EXISTS file_type text NOT NULL DEFAULT 'pdf',
  ADD COLUMN IF NOT EXISTS validation_warnings jsonb;
