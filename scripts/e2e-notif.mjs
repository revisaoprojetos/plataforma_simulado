import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); p.setDefaultTimeout(25000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000)
  await p.locator('input[type="email"]').fill('joao@gmail.com')
  await p.getByRole('button', { name: /continuar/i }).click()
  await p.waitForURL(/\/aluno/, { timeout: 25000 }).catch(()=>{}); await p.waitForTimeout(2000)
  const bell = await p.getByRole('button', { name: /Notificações/i }).count()
  res.push('sino na topbar: ' + bell)
  // testa a API direto no contexto da página (mesmos cookies)
  const api = await p.evaluate(async () => { const r = await fetch('/api/aluno/notificacoes'); return { status: r.status, body: await r.json() } })
  res.push('API /api/aluno/notificacoes: status=' + api.status + ' naoLidas=' + api.body.naoLidas + ' items=' + (api.body.items?.length ?? '?'))
  if (bell) { await p.getByRole('button', { name: /Notificações/i }).click(); await p.waitForTimeout(600)
    res.push('dropdown mostra estado: ' + /Nenhuma notificação|Marcar lidas/i.test(await p.locator('body').innerText())) }
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
