-- 099 — rls_test_create_user creaba usuarios que GoTrue no podia leer.
--
-- La 008 inserta la fila de auth.users directamente por SQL y deja en NULL
-- `instance_id` y todas las columnas de token (confirmation_token,
-- recovery_token, email_change*, phone_change*, reauthentication_token).
--
-- Para los tests RLS daba igual: solo mintean un JWT y consultan PostgREST, que
-- nunca mira esas columnas. Pero GoTrue las mapea a string NO nullable, asi que
-- al intentar iniciar sesion con ese usuario falla al leer la fila, concluye que
-- no existe e intenta crearlo de nuevo — chocando con el indice unico de email.
-- El sintoma es un opaco "Database error saving new user" sobre un usuario que
-- si existe. Aparecio al estrenar /api/dev/login contra el sandbox.
--
-- Se arregla en los dos sentidos: los usuarios nuevos nacen completos y los ya
-- creados se reparan cuando la funcion los encuentra (es idempotente por
-- diseno). Cadena vacia, no NULL: es lo que escribe GoTrue.

CREATE OR REPLACE FUNCTION public.rls_test_create_user(
  p_email    text,
  p_password text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE email = p_email LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    VALUES (gen_random_uuid(), v_id, p_email, 'email',
            jsonb_build_object('sub', v_id::text, 'email', p_email),
            now(), now())
    ON CONFLICT (provider, provider_id) DO NOTHING;

    -- Repara usuarios creados por la version anterior de esta funcion.
    UPDATE auth.users SET
      instance_id                = coalesce(instance_id, '00000000-0000-0000-0000-000000000000'::uuid),
      confirmation_token         = coalesce(confirmation_token, ''),
      recovery_token             = coalesce(recovery_token, ''),
      email_change               = coalesce(email_change, ''),
      email_change_token_new     = coalesce(email_change_token_new, ''),
      email_change_token_current = coalesce(email_change_token_current, ''),
      phone_change               = coalesce(phone_change, ''),
      phone_change_token         = coalesce(phone_change_token, ''),
      reauthentication_token     = coalesce(reauthentication_token, '')
    WHERE id = v_id;

    RETURN v_id;
  END IF;

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, aud, role,
    -- GoTrue espera cadena vacia en todas estas; con NULL no puede leer la fila.
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) VALUES (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000000',
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(), now(), 'authenticated', 'authenticated',
    '', '', '', '', '', '', '', ''
  )
  RETURNING id INTO v_id;

  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  VALUES (gen_random_uuid(), v_id, p_email, 'email',
          jsonb_build_object('sub', v_id::text, 'email', p_email),
          now(), now());

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rls_test_create_user(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rls_test_create_user(text, text) TO service_role;
