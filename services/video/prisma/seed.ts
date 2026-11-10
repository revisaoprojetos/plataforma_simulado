/* Seed de desenvolvimento — idempotente. Uso: npm run db:seed */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const password = process.env.SEED_PASSWORD ?? 'dev12345';
const TENANTS = [
  { slug: 'empresa-a', name: 'Empresa A' },
  { slug: 'empresa-b', name: 'Empresa B' },
];

async function upsertUser(tenantId: string | null, email: string, name: string, role: Role) {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const existing = await prisma.user.findFirst({ where: { tenantId, email } });
  if (existing) return prisma.user.update({ where: { id: existing.id }, data: { name, role } });
  return prisma.user.create({ data: { tenantId, email, name, role, passwordHash } });
}

async function seedTenant(slug: string, name: string) {
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { name },
    create: { slug, name, allowedDomains: ['localhost:5173'] },
  });
  const t = tenant.id;
  const admin = await upsertUser(t, `admin@${slug}.local`, `Admin ${name}`, 'admin');
  const professor = await upsertUser(
    t,
    `professor@${slug}.local`,
    `Professor ${name}`,
    'professor',
  );
  const aluno = await upsertUser(t, `aluno@${slug}.local`, `Aluno ${name}`, 'aluno');

  const title = `Curso de Exemplo (${name})`;
  const course =
    (await prisma.course.findFirst({ where: { tenantId: t, title } })) ??
    (await prisma.course.create({
      data: {
        tenantId: t,
        title,
        description: 'Curso criado pelo seed para testes locais',
        status: 'published',
        ownerId: professor.id,
        modules: {
          create: [
            {
              tenantId: t,
              title: 'Módulo 1',
              position: 1,
              lessons: {
                create: [
                  { tenantId: t, title: 'Aula 1', position: 1, status: 'published' },
                  { tenantId: t, title: 'Aula 2 (rascunho)', position: 2, status: 'draft' },
                ],
              },
            },
          ],
        },
      },
    }));

  await prisma.enrollment.upsert({
    where: { userId_courseId: { userId: aluno.id, courseId: course.id } },
    update: {},
    create: { tenantId: t, userId: aluno.id, courseId: course.id },
  });
  return [admin.email, professor.email, aluno.email];
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed não deve rodar em produção');

  const platform = await upsertUser(null, 'plataforma@exemplo.local', 'Operador', 'platform_admin');
  const emails = [platform.email];
  for (const t of TENANTS) emails.push(...(await seedTenant(t.slug, t.name)));

  console.log(`seed ok — ${emails.join(', ')} (senha de dev: SEED_PASSWORD ou "dev12345")`);
  console.log(
    'login de empresa: { tenant: "empresa-a", email, password }; platform_admin: sem "tenant"',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
