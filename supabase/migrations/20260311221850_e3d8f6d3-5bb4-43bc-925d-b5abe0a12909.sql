
-- Guest signatures table
CREATE TABLE public.guest_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  stay_id uuid NOT NULL REFERENCES public.stays(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.hotel_guests(id) ON DELETE CASCADE,
  signature_url text,
  document_photo_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.guest_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant users can view guest_signatures" ON public.guest_signatures FOR SELECT USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admin can manage guest_signatures" ON public.guest_signatures FOR ALL USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin')) WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Housekeeping tasks table
CREATE TABLE public.housekeeping_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  stay_id uuid REFERENCES public.stays(id) ON DELETE SET NULL,
  task_type text NOT NULL DEFAULT 'daily',
  status text NOT NULL DEFAULT 'pending',
  assigned_to uuid,
  priority text DEFAULT 'normal',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.housekeeping_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant users can view housekeeping_tasks" ON public.housekeeping_tasks FOR SELECT USING (restaurant_id = get_my_restaurant_id() AND has_any_role(auth.uid()));
CREATE POLICY "Admin can manage housekeeping_tasks" ON public.housekeeping_tasks FOR ALL USING (restaurant_id = get_my_restaurant_id() AND has_role(auth.uid(), 'admin')) WITH CHECK (restaurant_id = get_my_restaurant_id());

-- Storage bucket for hotel signatures and documents
INSERT INTO storage.buckets (id, name, public) VALUES ('hotel-documents', 'hotel-documents', false);

-- Storage RLS policies
CREATE POLICY "Authenticated users can upload hotel documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'hotel-documents');

CREATE POLICY "Authenticated users can view hotel documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'hotel-documents');
