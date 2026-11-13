import type { AchadoScan, ResultadoChecagem } from '../tipos'

interface RawBanco {
  tabelas_sem_rls?: string[]
  policies_abertas?: { tabela: string; policy: string; cmd?: string; roles?: string[]; qual?: string | null; with_check?: string | null }[]
  buckets_publicos?: { id: string; nome: string }[]
}

/** Pura: transforma o JSON de `seguranca_checar_banco()` em achados. */
export function avaliarBanco(raw: RawBanco | null | undefined): AchadoScan[] {
  const out: AchadoScan[] = []
  if (!raw) return out
  for (const t of raw.tabelas_sem_rls ?? []) {
    out.push({
      categoria: 'banco_rls', severidade: 'alto', titulo: `Tabela public.${t} sem RLS`,
      detalhe: 'relrowsecurity desligado: qualquer role com GRANT lê/escreve sem filtro.',
      recomendacao: `ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY; e criar policies (ou nenhuma, se só service role).`,
      fingerprint: `banco:sem-rls:${t}`,
    })
  }
  for (const p of raw.policies_abertas ?? []) {
    const anon = (p.roles ?? []).includes('anon')
    out.push({
      categoria: 'banco_rls', severidade: anon ? 'critico' : 'alto',
      titulo: `Policy aberta em public.${p.tabela}: ${p.policy}`,
      detalhe: `cmd=${p.cmd ?? '?'} roles=${(p.roles ?? []).join(',')} using=${p.qual ?? '-'} check=${p.with_check ?? '-'}`,
      recomendacao: 'Restringir a policy (tenant_id/auth.uid()) ou removê-la; evitar USING (true) e role anon.',
      fingerprint: `banco:policy:${p.tabela}:${p.policy}`,
    })
  }
  for (const b of raw.buckets_publicos ?? []) {
    out.push({
      categoria: 'banco_rls', severidade: 'alto', titulo: `Bucket de storage público: ${b.nome}`,
      detalhe: 'Objetos acessíveis por URL pública sem autenticação.',
      recomendacao: 'Tornar privado e servir por URL assinada, salvo se o conteúdo for realmente público.',
      fingerprint: `banco:bucket-publico:${b.id}`,
    })
  }
  return out
}

export async function checarBanco(svc: { rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> }): Promise<ResultadoChecagem> {
  const { data, error } = await svc.rpc('seguranca_checar_banco')
  if (error) return { nome: 'banco', achados: [], erro: `seguranca_checar_banco: ${error.message}` }
  return { nome: 'banco', achados: avaliarBanco(data as RawBanco) }
}
