import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

/**
 * API dedicada (Fase 3 do roadmap) — foundation enxuta.
 * Serve, por ora, o endpoint de relatório EXTRAÍDO (/v1/relatorios/resumos), reusando a
 * camada SQL do pacote compartilhado `data`. O app Next chama esta API quando o flag
 * RELATORIOS_API_URL está setado (strangler); senão segue com SQL/PostgREST local.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false })
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3001)
  await app.listen(port, '0.0.0.0')
  // eslint-disable-next-line no-console
  console.log(`[api] ouvindo em :${port}`)
}
void bootstrap()
