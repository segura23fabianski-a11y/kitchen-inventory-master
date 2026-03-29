-- Production-safe: tenant-scoped user_roles, restaurant visibility, create/switch restaurant RPCs,
-- block self-service profile.restaurant_id changes (use RPC).

-- 1) Link users to restaurants they may access (current profile + additional created by admin)
CREATE TABLE IF NOT EXISTS public.restaurant_account_owners (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, restaurant_id)
);

ALTER TABLE public.restaurant_account_owners ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.restaurant_account_owners IS
  'Usuarios con acceso a un restaurante. Mantenida por trigger al asignar profiles.restaurant_id.';

-- Backfill: every profile row grants access to its restaurant
INSERT INTO public.restaurant_account_owners (user_id, restaurant_id)
SELECT p.user_id, p.restaurant_id
FROM public.profiles p
WHERE p.restaurant_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Mantener owners alineados con profiles.restaurant_id (incluye aprobaciones y edge functions)
CREATE OR REPLACE FUNCTION public.sync_profile_restaurant_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.restaurant_id IS NOT NULL THEN
    INSERT INTO public.restaurant_account_owners (user_id, restaurant_id)
    VALUES (NEW.user_id, NEW.restaurant_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_profiles_sync_restaurant_owner ON public.profiles;
CREATE TRIGGER tr_profiles_sync_restaurant_owner
  AFTER INSERT OR UPDATE OF restaurant_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_restaurant_owner();

-- 2) Trigger: users cannot change their own restaurant_id except via switch RPC (sets session var)
CREATE OR REPLACE FUNCTION public.trg_profiles_prevent_restaurant_hijack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.user_id = auth.uid()
     AND NEW.restaurant_id IS DISTINCT FROM OLD.restaurant_id
     AND current_setting('app.allow_profile_restaurant_change', true) IS DISTINCT FROM '1'
  THEN
    RAISE EXCEPTION 'No puedes cambiar de restaurante aquí. Usa "Cambiar restaurante activo" en Restaurantes.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_profiles_prevent_restaurant_hijack ON public.profiles;
CREATE TRIGGER tr_profiles_prevent_restaurant_hijack
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profiles_prevent_restaurant_hijack();

-- 3) Restaurants: see any restaurant you are linked to; update only if linked + admin (no INSERT/DELETE from client)
DROP POLICY IF EXISTS "Active users can view own restaurant" ON public.restaurants;
DROP POLICY IF EXISTS "Admins can manage own restaurant" ON public.restaurants;

CREATE POLICY "Users can view linked restaurants"
  ON public.restaurants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.restaurant_account_owners rao
      WHERE rao.user_id = auth.uid() AND rao.restaurant_id = restaurants.id
    )
    AND public.has_any_role(auth.uid())
  );

CREATE POLICY "Admins can update linked restaurants"
  ON public.restaurants FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.restaurant_account_owners rao
      WHERE rao.user_id = auth.uid() AND rao.restaurant_id = restaurants.id
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1 FROM public.restaurant_account_owners rao
      WHERE rao.user_id = auth.uid() AND rao.restaurant_id = restaurants.id
    )
  );

-- 4) user_roles: admins only manage users in the same restaurant as their profile
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Admins manage roles same restaurant only"
  ON public.user_roles FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.profiles p_admin
      JOIN public.profiles p_target ON p_admin.restaurant_id = p_target.restaurant_id
      WHERE p_admin.user_id = auth.uid()
        AND p_target.user_id = user_roles.user_id
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.profiles p_admin
      JOIN public.profiles p_target ON p_admin.restaurant_id = p_target.restaurant_id
      WHERE p_admin.user_id = auth.uid()
        AND p_target.user_id = user_roles.user_id
    )
  );

-- 5) RPC: create restaurant (admin) and link to caller
CREATE OR REPLACE FUNCTION public.create_restaurant_for_account(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id uuid;
  v_trim text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Solo administradores pueden crear restaurantes';
  END IF;

  v_trim := btrim(p_name);
  IF v_trim IS NULL OR length(v_trim) < 2 THEN
    RAISE EXCEPTION 'Nombre de restaurante inválido';
  END IF;

  INSERT INTO public.restaurants (name) VALUES (v_trim) RETURNING id INTO v_new_id;

  -- Todos los admins que hoy trabajan en el mismo restaurante activo del creador pueden gestionar el nuevo local
  INSERT INTO public.restaurant_account_owners (user_id, restaurant_id)
  SELECT ur.user_id, v_new_id
  FROM public.user_roles ur
  JOIN public.profiles p ON p.user_id = ur.user_id
  WHERE ur.role = 'admin'
    AND p.restaurant_id = (SELECT pr.restaurant_id FROM public.profiles pr WHERE pr.user_id = auth.uid() LIMIT 1)
  ON CONFLICT DO NOTHING;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_restaurant_for_account(text) TO authenticated;

-- 6) RPC: switch active restaurant (must be linked)
CREATE OR REPLACE FUNCTION public.switch_active_restaurant(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.restaurant_account_owners rao
    WHERE rao.user_id = auth.uid() AND rao.restaurant_id = p_restaurant_id
  ) THEN
    RAISE EXCEPTION 'No tienes acceso a este restaurante';
  END IF;

  PERFORM set_config('app.allow_profile_restaurant_change', '1', true);

  UPDATE public.profiles
  SET restaurant_id = p_restaurant_id, updated_at = now()
  WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_active_restaurant(uuid) TO authenticated;
