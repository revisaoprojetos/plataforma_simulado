import { chromium } from 'playwright'
const BASE = 'http://localhost:3000', EMAIL = 'admin@teste.com', SENHA = 'Admin@2026'
const res = []
const b = await chromium.launch({ headless: true })
try {
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } })
  p.setDefaultTimeout(20000)
  await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200)
  await p.getByRole('button', { name: /^admin$/i }).first().click().catch(async () => { await p.getByRole('button', { name: /admin/i }).first().click() })
  await p.waitForTimeout(600)
  await p.locator('input[type="email"]').fill(EMAIL)
  await p.locator('input[type="password"]').fill(SENHA)
  await p.getByRole('button', { name: /entrar no painel/i }).click()
  await p.waitForURL(/\/admin(\b|\/|$)/, { timeout: 25000 }).catch(()=>{})
  await p.waitForTimeout(2500)
  res.push('LOGIN super-admin -> url=' + p.url())
  await p.screenshot({ path: 'scripts/_e2e-admin.png', fullPage: false })
  // Expande "Configuração" e checa itens super-admin
  const cfg = p.getByRole('button', { name: /configura/i })
  if (await cfg.count()) await cfg.first().click().catch(()=>{})
  await p.waitForTimeout(800)
  for (const it of ['Plataformas','Entrada','Compartilhar','Aparência']) res.push('menu "'+it+'": '+(await p.getByText(it,{exact:true}).count()>0?'OK':'ausente'))
  // Páginas super-admin
  await p.goto(BASE+'/admin/compartilhar',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1800)
  res.push('compartilhar: titulo='+(await p.getByText(/compartilhar entre plataformas/i).count())+' selects='+(await p.locator('select').count()))
  await p.screenshot({ path: 'scripts/_e2e-compartilhar.png' })
  await p.goto(BASE+'/admin/entrada',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500)
  res.push('entrada: titulo='+(await p.getByText(/entrada neutra/i).count()))
  await p.goto(BASE+'/admin/tenants',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(1500)
  res.push('tenants: linhas='+(await p.locator('tbody tr').count())+' badge-ativa='+(await p.getByText(/^ativa$/i).count()))
  await p.screenshot({ path: 'scripts/_e2e-tenants.png' })
} catch (e) { res.push('ERRO: ' + String(e.message||e).slice(0,240)) } finally { console.log(res.join('\n')); await b.close() }
