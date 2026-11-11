import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

/**
 * API dedicada (Fase 3 do roadmap) — foundation enxuta.
 * Serve, por ora, o endpoint de relatório EXTRAÍDO (/v1/relatorios/resumos), reusando a
 * camada SQL do pacote compartilhado `data`. O app Next chama esta API quando o flag
 * RELATORIOS_API_URL está setado (strangler); senão segue com SQL/PostgREST local.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false })

  // Swagger/OpenAPI em /api/docs (auth interna via header `x-api-secret`).
  // O bundle do tsup (esbuild) não emite `design:paramtypes`, e o Swagger quebra ao ler os parâmetros dos
  // controllers (TypeError em parameter-metadata-accessor) — antes isso derrubava a API inteira no boot.
  // A documentação é acessória: se falhar, a API sobe sem ela. `API_SWAGGER=false` desliga de propósito.
  if (process.env.API_SWAGGER !== 'false') {
    try {
      const cfg = new DocumentBuilder()
        .setTitle('Plataforma Simulado — API')
        .setDescription('Endpoints internos/relatórios. Autenticação por header `x-api-secret` (API_INTERNAL_SECRET).')
        .setVersion('1.0')
        .addApiKey({ type: 'apiKey', name: 'x-api-secret', in: 'header' }, 'internal')
        .build()
      const doc = SwaggerModule.createDocument(app, cfg)
      SwaggerModule.setup('api/docs', app, doc, { jsonDocumentUrl: 'api/docs-json' })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[api] Swagger indisponível (a API segue sem /api/docs):', (e as Error).message)
    }
  }

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001)
  await app.listen(port, '0.0.0.0')
  // eslint-disable-next-line no-console
  console.log(`[api] ouvindo em :${port} — docs em /api/docs`)
}
void bootstrap()
