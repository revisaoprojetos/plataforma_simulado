'use client'
// Conteúdo interativo da página do curso: abas Módulos / PDFs / LegProc / Questões.
// DADO REAL (via props): subpastas = "módulos" (drill por ?pasta), documentos = materiais reais da pasta
// (lido/não lido do histórico de leitura). Materiais abrem no leitor real (R.painelLeitor).
import * as React from 'react'
import { Tag } from '@/components/nova/ui'
import { Icon } from '@/components/nova/icons'
import { R } from '@/lib/nova/rotas'
import type { DocCurso, SubCurso } from '@/lib/nova/cursos'

function tipoLabel(tipo: string): string {
  const t = (tipo || '').toLowerCase()
  if (t === 'pdf') return 'PDF'
  if (t === 'docx') return 'Documento'
  if (t === 'html') return 'Leitura'
  return 'Material'
}

type TabKey = 'modulos' | 'pdfs' | 'legproc' | 'questoes'

function Circle({ lido }: { lido: boolean }) {
  return lido
    ? <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#2EC77A', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n="check" size={14} /></span>
    : <span style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid var(--line2)', boxSizing: 'border-box', flexShrink: 0 }} />
}

function DocRow({ d }: { d: DocCurso }) {
  return (
    <a href={R.painelLeitor(d.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderTop: '1px solid var(--line)', background: 'transparent' }}>
      <Circle lido={d.lido} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <b style={{ fontSize: 14.5, color: 'var(--ink)' }}>{d.titulo}</b>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Tag kind="red">{tipoLabel(d.tipo)}</Tag>
          {d.lido ? <Tag kind="green" icon="check">Lido</Tag> : null}
        </div>
      </div>
      <Icon n="chev" size={16} style={{ color: 'var(--muted2)' }} />
    </a>
  )
}

function ModuloLink({ cursoId, m }: { cursoId: string; m: SubCurso }) {
  return (
    <a href={`${R.curso(cursoId)}?pasta=${encodeURIComponent(m.id)}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20 }}>
      <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface2)', color: 'var(--brand)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon n="layers" size={18} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 16, color: 'var(--ink)' }}>{m.nome}</b>
        <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted)' }}>{m.totalDocs.toLocaleString('pt-BR')} materiai{m.totalDocs === 1 ? 'al' : 's'}</span>
      </div>
      <Icon n="chev" size={18} style={{ color: 'var(--muted)' }} />
    </a>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 28, textAlign: 'center' }}>
      <span style={{ display: 'block', fontSize: 13, color: 'var(--muted)' }}>{children}</span>
    </div>
  )
}

export default function Conteudo({ cursoId, documentos, subpastas, breadcrumb }: { cursoId: string; documentos: DocCurso[]; subpastas: SubCurso[]; breadcrumb: { id: string; nome: string }[] }) {
  const [tab, setTab] = React.useState<TabKey>(subpastas.length ? 'modulos' : 'pdfs')
  const dentro = breadcrumb.length > 1 // navegou para uma subpasta (módulo)
  const voltarHref = dentro
    ? (breadcrumb.length > 2 ? `${R.curso(cursoId)}?pasta=${encodeURIComponent(breadcrumb[breadcrumb.length - 2].id)}` : R.curso(cursoId))
    : null

  const TABS: { k: TabKey; label: string; count: number }[] = [
    { k: 'modulos', label: 'Módulos', count: subpastas.length },
    { k: 'pdfs', label: 'PDFs', count: documentos.length },
    { k: 'legproc', label: 'LegProc', count: 0 },
    { k: 'questoes', label: 'Questões', count: 0 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {dentro && (
        <a href={voltarHref ?? R.curso(cursoId)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 34, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--surface)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
          <Icon n="back" size={14} />{breadcrumb[breadcrumb.length - 1]?.nome ?? 'Voltar'}
        </a>
      )}

      <nav aria-label="Seções" style={{ display: 'flex', gap: 26, borderBottom: '1px solid var(--line)', overflowX: 'auto' }}>
        {TABS.map((t) => {
          const on = t.k === tab
          return (
            <button key={t.k} type="button" onClick={() => setTab(t.k)} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8, height: 46, padding: '0 4px', border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', fontSize: 14, fontWeight: on ? 800 : 700, color: on ? 'var(--ink)' : 'var(--muted)', whiteSpace: 'nowrap' }}>
              {t.label}
              {t.count > 0 ? <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 7px', borderRadius: 99, background: 'var(--chip)', color: 'var(--brand)' }}>{t.count.toLocaleString('pt-BR')}</span> : null}
              <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, borderRadius: '3px 3px 0 0', background: on ? 'var(--gold)' : 'transparent' }} />
            </button>
          )
        })}
      </nav>

      {tab === 'modulos' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {subpastas.length === 0 && documentos.length === 0 ? (
            <Vazio>Este curso ainda não tem materiais publicados.</Vazio>
          ) : (
            <>
              {subpastas.map((m) => <ModuloLink key={m.id} cursoId={cursoId} m={m} />)}
              {documentos.length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>Materiais deste nível</div>
                  {documentos.map((d) => <DocRow key={d.id} d={d} />)}
                </div>
              )}
            </>
          )}
        </div>
      ) : tab === 'pdfs' ? (
        documentos.length ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden' }}>
            {documentos.map((d) => <DocRow key={d.id} d={d} />)}
          </div>
        ) : <Vazio>Nenhum material neste nível — abra um módulo acima.</Vazio>
      ) : tab === 'legproc' ? (
        <Vazio>
          {/* TODO(dados): vínculo curso→legislação não existe; a legislação anotada vive na Central. */}
          A legislação anotada deste curso fica no <a href={R.legproc} style={{ color: 'var(--brand)', fontWeight: 700 }}>LegProc</a>.
        </Vazio>
      ) : (
        <Vazio>
          {/* TODO(dados): vínculo curso→banco de questões não existe; o banco é por disciplina na Central. */}
          Pratique questões no <a href={R.banco} style={{ color: 'var(--brand)', fontWeight: 700 }}>Banco de questões</a>.
        </Vazio>
      )}
    </div>
  )
}
