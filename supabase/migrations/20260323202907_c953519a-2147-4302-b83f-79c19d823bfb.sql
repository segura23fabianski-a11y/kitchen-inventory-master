
ALTER TABLE public.smart_invoices 
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_email_from text,
  ADD COLUMN IF NOT EXISTS source_email_subject text;
