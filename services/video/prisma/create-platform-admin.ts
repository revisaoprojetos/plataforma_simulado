/*
 * Cria o primeiro operador da plataforma (platform_admin), que cadastra as empresas.
 * É o único jeito de "nascer" um operador em produção (o seed não roda lá).
 *
 *   PLATFORM_ADMIN_EMAIL=voce@exemplo.com PLATFORM_ADMIN_PASSWORD='uma-senha-longa' npm run admin:create
 *
 * Idempotente e seguro: se o e-mail já existe, não altera nada. A senha não é impressa.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Informe PLATFORM_ADMIN_EMAIL com um e-mail válido');
  }
  if (!password || password.length < 12) {
    throw new Error('Informe PLATFORM_ADMIN_PASSWORD com ao menos 12 caracteres');
  }

  const existing = await prisma.user.findFirst({ where: { tenantId: null, email } });
  if (existing) {
    console.log(`Operador ${email} já existe; nada foi alterado.`);
    return;
  }

  await prisma.user.create({
    data: {
      tenantId: null,
      email,
      name: 'Operador da plataforma',
      role: 'platform_admin',
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    },
  });
  console.log(`Operador ${email} criado. Entre sem informar "tenant" em POST /v1/auth/login.`);
}

main()
  .catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
