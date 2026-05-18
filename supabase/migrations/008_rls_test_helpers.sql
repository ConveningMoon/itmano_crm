-- Migration 008: RLS test helper functions
--
-- These functions are used ONLY by the Vitest RLS test suite.
-- They create/delete auth.users rows directly (bypassing the Admin API, which
-- requires email auth to be enabled) so the test runner can create fixture users
-- regardless of project-level email-auth settings. The test suite then mints
-- HS256 JWTs directly using SUPABASE_JWT_SECRET to authenticate as each user.
--
-- All functions are SECURITY DEFINER and restricted to service_role only —
-- they are never callable from the browser or the anon key.

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
  -- Return existing user if already present (idempotent)
  SELECT id INTO v_id FROM auth.users WHERE email = p_email LIMIT 1;
  IF v_id IS NOT NULL THEN
    -- Ensure an email identity exists (required for generateLink)
    INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
    VALUES (gen_random_uuid(), v_id, p_email, 'email',
            jsonb_build_object('sub', v_id::text, 'email', p_email),
            now(), now())
    ON CONFLICT (provider, provider_id) DO NOTHING;
    RETURN v_id;
  END IF;

  -- Insert the auth user row
  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, aud, role
  ) VALUES (
    gen_random_uuid(),
    p_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(), now(), 'authenticated', 'authenticated'
  )
  RETURNING id INTO v_id;

  -- Insert the corresponding email identity (required for generateLink)
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
  VALUES (gen_random_uuid(), v_id, p_email, 'email',
          jsonb_build_object('sub', v_id::text, 'email', p_email),
          now(), now());

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rls_test_delete_user(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM auth.users WHERE email = p_email;
END;
$$;

-- Returns the auth.users id for a given email — used by the test suite to look
-- up the user UUID before minting a JWT.
CREATE OR REPLACE FUNCTION public.rls_test_get_user_id(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE email = p_email LIMIT 1;
$$;

-- Base64url helper used by rls_jwt_sign
CREATE OR REPLACE FUNCTION public.rls_jwt_base64url_encode(data bytea)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT translate(encode(data, 'base64'), E'+/=\n', '-_');
$$;

-- HS256 JWT signer — takes arbitrary payload JSON and a secret string.
CREATE OR REPLACE FUNCTION public.rls_jwt_sign(payload json, secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_header    text;
  v_body      text;
  v_signing   text;
  v_signature text;
BEGIN
  v_header  := rls_jwt_base64url_encode('{"alg":"HS256","typ":"JWT"}'::bytea);
  v_body    := rls_jwt_base64url_encode(payload::text::bytea);
  v_signing := v_header || '.' || v_body;
  v_signature := rls_jwt_base64url_encode(
    extensions.hmac(v_signing::bytea, secret::bytea, 'sha256')
  );
  RETURN v_signing || '.' || v_signature;
END;
$$;

-- Vault-backed variant (no-argument secret lookup).
-- Requires: SELECT vault.create_secret('your-jwt-secret', 'supabase_jwt_secret');
CREATE OR REPLACE FUNCTION public.rls_test_mint_jwt(p_email text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id  uuid;
  v_secret   text;
  v_now      bigint := extract(epoch from now())::bigint;
  v_exp      bigint := v_now + 3600;
  v_payload  json;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'rls_test_mint_jwt: no user found for email %', p_email;
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'supabase_jwt_secret'
  LIMIT 1;
  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'rls_test_mint_jwt: supabase_jwt_secret not found in vault. '
      'Run: SELECT vault.create_secret(''your-jwt-secret'', ''supabase_jwt_secret'');';
  END IF;

  v_payload := json_build_object(
    'iss',   'supabase',
    'role',  'authenticated',
    'sub',   v_user_id::text,
    'email', p_email,
    'aud',   'authenticated',
    'iat',   v_now,
    'exp',   v_exp
  );

  RETURN rls_jwt_sign(v_payload, v_secret);
END;
$$;

-- Env-var variant — the test runner passes SUPABASE_JWT_SECRET from .env.local.
-- This is the variant actually called by tests/rls/setup.ts.
-- Avoids the one-time Vault setup step while keeping the secret out of migrations.
CREATE OR REPLACE FUNCTION public.rls_test_mint_jwt(p_email text, p_secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id  uuid;
  v_now      bigint := extract(epoch from now())::bigint;
  v_exp      bigint := v_now + 3600;
  v_payload  json;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'rls_test_mint_jwt: no user found for email %', p_email;
  END IF;

  v_payload := json_build_object(
    'iss',   'supabase',
    'role',  'authenticated',
    'sub',   v_user_id::text,
    'email', p_email,
    'aud',   'authenticated',
    'iat',   v_now,
    'exp',   v_exp
  );

  RETURN rls_jwt_sign(v_payload, p_secret);
END;
$$;

-- Restrict all functions to service_role only
REVOKE ALL ON FUNCTION public.rls_test_create_user(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rls_test_create_user(text, text) TO service_role;

REVOKE ALL ON FUNCTION public.rls_test_delete_user(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rls_test_delete_user(text) TO service_role;

REVOKE ALL ON FUNCTION public.rls_test_get_user_id(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rls_test_get_user_id(text) TO service_role;

REVOKE ALL ON FUNCTION public.rls_jwt_base64url_encode(bytea) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rls_jwt_base64url_encode(bytea) TO service_role;

REVOKE ALL ON FUNCTION public.rls_jwt_sign(json, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rls_jwt_sign(json, text) TO service_role;

REVOKE ALL ON FUNCTION public.rls_test_mint_jwt(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rls_test_mint_jwt(text) TO service_role;

REVOKE ALL ON FUNCTION public.rls_test_mint_jwt(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rls_test_mint_jwt(text, text) TO service_role;
