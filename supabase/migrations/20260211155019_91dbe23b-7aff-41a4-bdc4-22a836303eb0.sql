
-- 1. Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view role permissions" ON public.role_permissions;

-- 2. Only admins can SELECT role_permissions (they manage the matrix)
CREATE POLICY "Admins can view role permissions"
ON public.role_permissions
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Create a SECURITY DEFINER function for permission checks
-- This lets any authenticated user check their own permissions without reading the table directly
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _function_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    INNER JOIN public.user_roles ur ON ur.role = rp.role
    WHERE ur.user_id = _user_id
      AND rp.function_key = _function_key
  )
$$;

-- 4. Create a function to get all permissions for a user (returns function keys)
CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE(function_key text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT rp.function_key
  FROM public.role_permissions rp
  INNER JOIN public.user_roles ur ON ur.role = rp.role
  WHERE ur.user_id = auth.uid()
$$;
