import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Helper de teste de vazamento entre empresas, GUIADO PELO SCHEMA: ao criar uma tabela nova com
 * `tenantId`, ela entra automaticamente nas verificações; uma tabela de negócio SEM `tenantId` faz
 * o teste falhar (a menos que esteja na lista de exceções explícitas).
 */

const models = Prisma.dmmf.datamodel.models;

/** Tabelas sem coluna tenant_id por desenho (e o motivo). */
export const GLOBAL_MODELS: Record<string, string> = {
  Tenant: 'é a própria empresa',
  RefreshToken: 'pertence ao usuário (que carrega o tenant); acesso só por hash do token',
};

export const tenantScopedModels = () =>
  models.filter((m) => m.fields.some((f) => f.name === 'tenantId'));

/** Modelos que não têm tenantId e também não são exceção declarada. Deve ser vazio. */
export const modelsMissingTenant = (): string[] =>
  models
    .filter((m) => !m.fields.some((f) => f.name === 'tenantId') && !(m.name in GLOBAL_MODELS))
    .map((m) => m.name);

const table = (m: { name: string; dbName?: string | null }) => m.dbName ?? m.name;
const column = (m: { fields: readonly { name: string; dbName?: string | null }[] }, f: string) =>
  m.fields.find((x) => x.name === f)?.dbName ?? f;

export interface FkViolation {
  child: string;
  parent: string;
  via: string;
  rows: number;
}

/**
 * Para cada FK entre duas tabelas que têm tenant_id, conta as linhas em que o filho aponta para um
 * pai de OUTRA empresa. Qualquer resultado diferente de zero é vazamento (ou bug de gravação).
 */
export async function crossTenantFkViolations(prisma: PrismaClient): Promise<FkViolation[]> {
  const scoped = new Set(tenantScopedModels().map((m) => m.name));
  const out: FkViolation[] = [];
  for (const child of tenantScopedModels()) {
    for (const f of child.fields) {
      if (f.kind !== 'object' || !scoped.has(f.type) || f.type === 'Tenant') continue;
      const from = f.relationFromFields?.[0];
      const to = f.relationToFields?.[0];
      if (!from || !to) continue; // lado "lista" da relação
      const parent = models.find((m) => m.name === f.type)!;
      const sql = `SELECT COUNT(*)::int AS n FROM "${table(child)}" c
        JOIN "${table(parent)}" p ON p."${column(parent, to)}" = c."${column(child, from)}"
        WHERE c."tenant_id" <> p."tenant_id"`;
      const [{ n }] = await prisma.$queryRawUnsafe<{ n: number }[]>(sql);
      if (n > 0) out.push({ child: child.name, parent: parent.name, via: f.name, rows: n });
    }
  }
  return out;
}

/** Linhas de cada tabela com tenant_id, agrupadas por empresa (para provar que o seed cobre todas). */
export async function rowsPerTenant(
  prisma: PrismaClient,
): Promise<Record<string, Record<string, number>>> {
  const result: Record<string, Record<string, number>> = {};
  for (const m of tenantScopedModels()) {
    const rows = await prisma.$queryRawUnsafe<{ tenant_id: string; n: number }[]>(
      `SELECT "tenant_id", COUNT(*)::int AS n FROM "${table(m)}" GROUP BY "tenant_id"`,
    );
    result[m.name] = Object.fromEntries(rows.map((r) => [r.tenant_id, r.n]));
  }
  return result;
}
