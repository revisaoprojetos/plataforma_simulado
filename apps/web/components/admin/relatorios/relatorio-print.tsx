import { CadernoPrintControls } from '@/components/admin/caderno-print-controls'

const fmtHoje = () => new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/**
 * Moldura de impressão dos relatórios (folha A4 branca + cabeçalho com a marca).
 * O Gotenberg renderiza esta página; reaproveita as MESMAS views (com `print`),
 * então o PDF fica visualmente igual ao relatório na tela.
 */
export function RelatorioPrint({ cor, logo, tenantNome, titulo, subtitulo, children }: {
  cor: string; logo: string | null; tenantNome: string; titulo: string; subtitulo: string; children: React.ReactNode
}) {
  const estilo = `
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body { background: #fff; }
    .rel-wrap { padding: 20px 0; }
    .rel-folha { width: 210mm; margin: 0 auto; padding: 10mm 10mm; box-sizing: border-box; background: #fff; }
    @media screen { .rel-folha { box-shadow: 0 1px 12px rgba(0,0,0,.15); border-radius: 8px; } }
    .rel-folha .rounded-2xl { break-inside: avoid; }
    @media print {
      .no-print { display: none !important; }
      @page { size: A4; margin: 8mm; }
      html, body { margin: 0 !important; padding: 0 !important; }
      .rel-wrap { padding: 0 !important; }
      .rel-folha { width: auto; box-shadow: none; border-radius: 0; padding: 0; }
    }
  `
  return (
    <div className="rel-wrap min-h-screen bg-neutral-100 text-foreground" style={{ ['--primary' as string]: cor }}>
      <style>{estilo}</style>
      <CadernoPrintControls />
      <div className="rel-folha">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: `2px solid ${cor}`, paddingBottom: 12, marginBottom: 18 }}>
          {logo && <img src={logo} alt="" style={{ height: 40, width: 'auto', objectFit: 'contain' }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>{subtitulo}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#111' }}>{titulo}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11, color: '#666' }}>
            <div style={{ fontWeight: 600, color: '#111' }}>{tenantNome}</div>
            <div>{fmtHoje()}</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
