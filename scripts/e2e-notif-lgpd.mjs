import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  // ===== TEST A: sino do aluno (notificação real) =====
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } }); p.setDefaultTimeout(25000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1000)
  await p.locator('input[type="email"]').fill('joao@gmail.com')
  await p.getByRole('button', { name: /continuar/i }).click()
  await p.waitForURL(/\/aluno/, { timeout: 25000 }).catch(()=>{}); await p.waitForTimeout(2000)
  const api1 = await p.evaluate(async () => (await fetch('/api/aluno/notificacoes')).json())
  res.push('A1 API naoLidas (esperado>=1): ' + api1.naoLidas + ' | 1º título: ' + (api1.items?.[0]?.titulo || '?'))
  // badge visível?
  const badge = await p.locator('button[aria-label="Notificações"] span').count()
  res.push('A2 badge não-lidas visível: ' + (badge > 0))
  // abre o sino (deve marcar lidas)
  await p.getByRole('button', { name: /Notificações/i }).click(); await p.waitForTimeout(400)
  res.push('A3 dropdown mostra a notif: ' + /TESTE E2E — Gabarito liberado/i.test(await p.locator('body').innerText()))
  await p.waitForTimeout(1200) // deixa o POST marcar-lidas completar
  const api2 = await p.evaluate(async () => (await fetch('/api/aluno/notificacoes')).json())
  res.push('A4 após abrir, naoLidas (esperado 0): ' + api2.naoLidas)

  // ===== TEST B: LGPD anonimizar (estudante dummy) =====
  const a = await b.newPage({ viewport: { width: 1300, height: 900 } }); a.setDefaultTimeout(25000)
  await a.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(800)
  await a.getByRole('button', { name: /admin/i }).first().click(); await a.waitForTimeout(400)
  await a.locator('input[type="email"]').fill('admin@teste.com'); await a.locator('input[type="password"]').fill('Admin@2026')
  await a.getByRole('button', { name: /entrar no painel/i }).click()
  await a.waitForURL(/\/admin/, { timeout: 25000 }).catch(()=>{}); await a.waitForTimeout(1500)
  await a.goto('http://localhost:3000/admin/lgpd', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(2500)
  res.push('B1 solicitação do dummy aparece: ' + /DUMMY LGPD DELETE/i.test(await a.locator('body').innerText()))
  // clica Anonimizar na linha do dummy
  const linha = a.locator('div').filter({ hasText: 'DUMMY LGPD DELETE' }).last()
  await a.getByRole('button', { name: /Anonimizar/i }).first().click(); await a.waitForTimeout(700)
  // confirma no diálogo
  await a.getByRole('button', { name: /^Anonimizar$/ }).last().click().catch(async()=>{ await a.locator('button', { hasText: /^Anonimizar$/ }).last().click() })
  await a.waitForTimeout(2500)
  res.push('B2 toast/estado concluído: ' + /anonimizado|Concluída|concluída/i.test(await a.locator('body').innerText()))
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,220)) } finally { console.log(res.join('\n')); await b.close() }
