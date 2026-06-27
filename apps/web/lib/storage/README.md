# Camada de Storage (abstrata)

Pré-montada e **ainda não ligada** a nenhuma feature. Troca de provider (Supabase ↔ S3 ↔ GCS)
sem mudar código — só env + (para S3/GCS) instalar o SDK.

## Ativar

1. `STORAGE_PROVIDER=supabase | s3 | gcs` no `.env` (default `supabase`, já funcional).
2. Para **S3**: `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` + vars `S3_*`.
   Para **GCS**: `pnpm add @google-cloud/storage` + vars `GCS_*`.
3. Crie o bucket no provider.

## Uso (quando for plugar numa feature)

```ts
import { uploadArquivo, PRESETS } from '@/lib/storage'

// Em uma rota/action server-side, com o arquivo já em Buffer/Uint8Array:
const r = await uploadArquivo({
  tenantId,
  bucket: 'simulado-arquivos',
  path: `${tenantId}/questoes/${crypto.randomUUID()}.png`,
  data: buffer,
  contentType: 'image/png',
  nome: 'enunciado.png',
  publico: true,
  validar: PRESETS.imagem,          // valida tamanho + MIME + magic bytes
  criadoPor: userId,
})
// r.upload.url  → URL pública (se publico)
// r.arquivoId   → id em simulado_arquivos
```

URL assinada para arquivo privado:

```ts
import { getStorage } from '@/lib/storage'
const url = await getStorage().getSignedUrl('bucket', 'path', 3600)
```

## Arquivos

- `types.ts` — interface `StorageProvider` + tipos.
- `validate.ts` — validação server-side (tamanho, MIME, **magic bytes** anti-spoof) + `PRESETS`.
- `providers/supabase.ts` — Supabase Storage (funcional).
- `providers/s3.ts` — S3/R2/MinIO (SDK por import dinâmico).
- `providers/gcs.ts` — Google Cloud Storage (SDK por import dinâmico).
- `index.ts` — `getStorage()` (factory por env) + `uploadArquivo()` (valida → upload → registra em `simulado_arquivos`).
