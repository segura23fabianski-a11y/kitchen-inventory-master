
-- Drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Admin can manage checklist_templates" ON public.housekeeping_checklist_templates;
DROP POLICY IF EXISTS "Tenant users can view checklist_templates" ON public.housekeeping_checklist_templates;

CREATE POLICY "Admin can manage checklist_templates"
ON public.housekeeping_checklist_templates
FOR ALL
TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_role(auth.uid(), 'admin'::text))
WITH CHECK (restaurant_id = get_my_restaurant_id());

CREATE POLICY "Tenant users can view checklist_templates"
ON public.housekeeping_checklist_templates
FOR SELECT
TO public
USING ((restaurant_id = get_my_restaurant_id()) AND has_any_role(auth.uid()));
