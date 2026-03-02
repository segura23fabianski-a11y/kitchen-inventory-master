
-- Create audit_events table
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  before JSONB NULL,
  after JSONB NULL,
  can_rollback BOOLEAN NOT NULL DEFAULT false,
  rollback_applied BOOLEAN NOT NULL DEFAULT false,
  rollback_of_event_id UUID NULL REFERENCES public.audit_events(id),
  metadata JSONB NULL
);

-- Indexes
CREATE INDEX idx_audit_events_restaurant_date ON public.audit_events (restaurant_id, created_at DESC);
CREATE INDEX idx_audit_events_entity ON public.audit_events (entity_type, entity_id);

-- Enable RLS
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Only admin can view audit events for their tenant
CREATE POLICY "Admin can view tenant audit events"
  ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (
    restaurant_id = get_my_restaurant_id()
    AND has_role(auth.uid(), 'admin')
  );

-- Any authenticated user can insert audit events (from app code)
CREATE POLICY "Authenticated users can insert audit events"
  ON public.audit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    restaurant_id = get_my_restaurant_id()
    AND performed_by = auth.uid()
  );

-- Admin can update (for rollback_applied flag)
CREATE POLICY "Admin can update tenant audit events"
  ON public.audit_events
  FOR UPDATE
  TO authenticated
  USING (
    restaurant_id = get_my_restaurant_id()
    AND has_role(auth.uid(), 'admin')
  );
