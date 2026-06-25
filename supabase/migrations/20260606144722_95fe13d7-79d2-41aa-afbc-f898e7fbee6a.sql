
-- Habilita pgcrypto para crypt/gen_salt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Cria usuário admin de teste
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@teste.com') THEN
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      'admin@teste.com', extensions.crypt('Admin@2026', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      '{"nome":"Admin Teste","role":"admin"}'::jsonb,
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', 'admin@teste.com'),
      'email', v_user_id::text, now(), now(), now());

    INSERT INTO public.administradores (user_id, nome, email)
    VALUES (v_user_id, 'Admin Teste', 'admin@teste.com')
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
