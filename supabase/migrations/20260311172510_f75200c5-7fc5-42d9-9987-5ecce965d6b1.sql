-- Add cost tracking columns to transformation_runs
ALTER TABLE public.transformation_runs
  ADD COLUMN IF NOT EXISTS input_unit_cost numeric NOT NULL DEFAULT 0;

-- Add calculated cost to transformation_run_outputs
ALTER TABLE public.transformation_run_outputs
  ADD COLUMN IF NOT EXISTS calculated_unit_cost numeric NOT NULL DEFAULT 0;