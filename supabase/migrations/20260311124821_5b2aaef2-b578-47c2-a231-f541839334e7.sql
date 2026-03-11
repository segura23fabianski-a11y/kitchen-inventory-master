
CREATE OR REPLACE FUNCTION public.validate_movement_backdate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _can_backdate boolean;
  _init_mode boolean;
  _max_days integer;
  _setting_val jsonb;
BEGIN
  -- Skip validation for entrada movements (purchase invoices use past dates legitimately)
  IF NEW.type = 'entrada' THEN
    RETURN NEW;
  END IF;

  -- If movement_date is approximately now (within 1 minute), allow always
  IF ABS(EXTRACT(EPOCH FROM (NEW.movement_date - now()))) < 60 THEN
    RETURN NEW;
  END IF;

  -- Don't allow future dates
  IF NEW.movement_date > now() THEN
    RAISE EXCEPTION 'No se permiten fechas futuras en movement_date';
  END IF;

  -- Check user permission
  SELECT p.can_backdate_inventory INTO _can_backdate
    FROM public.profiles p WHERE p.user_id = NEW.user_id;
  
  IF NOT COALESCE(_can_backdate, false) THEN
    RAISE EXCEPTION 'Usuario no tiene permiso para registrar movimientos con fecha anterior';
  END IF;

  -- Check global initialization mode
  SELECT value INTO _setting_val
    FROM public.app_settings
    WHERE restaurant_id = NEW.restaurant_id AND key = 'inventory_initialization_mode';
  
  _init_mode := COALESCE((_setting_val)::text::boolean, false);
  
  IF NOT _init_mode THEN
    RAISE EXCEPTION 'El modo de inicialización de inventario no está activo';
  END IF;

  -- Check max days
  SELECT value INTO _setting_val
    FROM public.app_settings
    WHERE restaurant_id = NEW.restaurant_id AND key = 'backdate_max_days';
  
  _max_days := COALESCE((_setting_val)::text::integer, 45);
  
  IF NEW.movement_date < (now() - (_max_days || ' days')::interval) THEN
    RAISE EXCEPTION 'La fecha no puede ser anterior a % días', _max_days;
  END IF;

  -- Require notes for backdated movements
  IF NEW.notes IS NULL OR trim(NEW.notes) = '' THEN
    RAISE EXCEPTION 'Se requiere un motivo para movimientos con fecha anterior';
  END IF;

  RETURN NEW;
END;
$function$;
