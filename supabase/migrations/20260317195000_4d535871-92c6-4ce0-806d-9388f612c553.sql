
CREATE OR REPLACE FUNCTION validate_movement_backdate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _can_backdate boolean;
  _has_role_perm boolean;
  _init_mode boolean;
  _max_days integer;
  _setting_val jsonb;
BEGIN
  IF NEW.type = 'entrada' THEN
    RETURN NEW;
  END IF;

  IF ABS(EXTRACT(EPOCH FROM (NEW.movement_date - now()))) < 60 THEN
    RETURN NEW;
  END IF;

  IF NEW.movement_date > now() THEN
    RAISE EXCEPTION 'No se permiten fechas futuras en movement_date';
  END IF;

  SELECT COALESCE(p.can_backdate_inventory, false) INTO _can_backdate
    FROM public.profiles p WHERE p.user_id = NEW.user_id;

  SELECT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    JOIN public.user_roles ur ON ur.role = rp.role_name
    JOIN public.system_functions sf ON sf.id = rp.function_id
    WHERE ur.user_id = NEW.user_id
      AND sf.function_key = 'inventory_init_mode'
  ) INTO _has_role_perm;

  IF NOT (COALESCE(_can_backdate, false) OR COALESCE(_has_role_perm, false)) THEN
    RAISE EXCEPTION 'Usuario no tiene permiso para registrar movimientos con fecha anterior';
  END IF;

  SELECT value INTO _setting_val
    FROM public.app_settings
    WHERE restaurant_id = NEW.restaurant_id AND key = 'inventory_initialization_mode';
  
  _init_mode := COALESCE((_setting_val)::text::boolean, false);
  
  IF NOT _init_mode THEN
    RAISE EXCEPTION 'El modo de inicialización de inventario no está activo';
  END IF;

  SELECT value INTO _setting_val
    FROM public.app_settings
    WHERE restaurant_id = NEW.restaurant_id AND key = 'backdate_max_days';
  
  _max_days := COALESCE((_setting_val)::text::integer, 45);
  
  IF NEW.movement_date < (now() - (_max_days || ' days')::interval) THEN
    RAISE EXCEPTION 'La fecha no puede ser anterior a % días', _max_days;
  END IF;

  IF NEW.notes IS NULL OR trim(NEW.notes) = '' THEN
    RAISE EXCEPTION 'Se requiere un motivo para movimientos con fecha anterior';
  END IF;

  RETURN NEW;
END;
$$;
