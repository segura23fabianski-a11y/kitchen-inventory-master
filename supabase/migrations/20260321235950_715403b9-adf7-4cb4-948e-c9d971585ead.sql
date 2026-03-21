
-- AI chat logs for audit
CREATE TABLE public.ai_chat_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id),
  user_id uuid NOT NULL,
  user_question text NOT NULL,
  ai_response text,
  analysis_type text DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_chat_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own restaurant ai logs"
  ON public.ai_chat_logs FOR SELECT TO authenticated
  USING (restaurant_id = public.get_my_restaurant_id());

CREATE POLICY "Users can insert own ai logs"
  ON public.ai_chat_logs FOR INSERT TO authenticated
  WITH CHECK (restaurant_id = public.get_my_restaurant_id() AND user_id = auth.uid());

-- Add business_ai permission
INSERT INTO public.system_functions (key, label, category) 
VALUES ('business_ai', 'Asistente IA de Negocio', 'Administración')
ON CONFLICT (key) DO NOTHING;
