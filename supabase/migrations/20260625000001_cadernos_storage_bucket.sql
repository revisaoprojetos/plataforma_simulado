-- Cria o bucket de armazenamento para imagens do Designer de Cadernos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cadernos',
  'cadernos',
  true,
  8388608,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Leitura pública (qualquer um pode ver as imagens)
CREATE POLICY "cadernos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cadernos');

-- Apenas admins podem fazer upload
CREATE POLICY "cadernos_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cadernos'
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Apenas admins podem atualizar
CREATE POLICY "cadernos_admin_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cadernos'
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Apenas admins podem excluir
CREATE POLICY "cadernos_admin_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cadernos'
    AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
