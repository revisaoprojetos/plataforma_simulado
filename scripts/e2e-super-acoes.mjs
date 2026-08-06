import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []; const errs = []
try {
  const a = await b.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1.2 }); a.setDefaultTimeout(30000)
  a.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).slice(0,160)))
  await a.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(700)
  await a.getByRole('button', { name: /^Admin$/ }).click().catch(()=>{}); await a.waitForTimeout(300)
  await a.locator('input[type=email]').fill('admin@teste.com'); await a.locator('input[type=password]').fill('Admin@2026')
  await a.getByRole('button', { name: /entrar no painel/i }).click(); await a.waitForTimeout(1500)
  await a.goto('http://localhost:3000/super/plataformas', { waitUntil: 'domcontentloaded' }); await a.waitForTimeout(2200)
  // abre o kebab da 1ª plataforma
  const kebabs = a.getByRole('button', { name: /Ações de/i })
  res.push('nº kebabs: ' + await kebabs.count())
  await kebabs.first().click().catch(()=>{}); await a.waitForTimeout(600)
  const menu = await a.locator('body').innerText()
  res.push('menu tem Configurações: ' + /Configura[çc][õo]es/i.test(menu))
  res.push('menu tem Ocultar/Reativar: ' + /(Ocultar|Reativar) visualiza/i.test(menu))
  res.push('menu tem Excluir: ' + /Excluir/i.test(menu))
  await a.screenshot({ path: 'scripts/_super_kebab.png', fullPage: false })
  // lê o href do item Configurações e tenta o clique real; se não navegar, vai direto
  const href = await a.locator('a[href^="/super/plataformas/"]').first().getAttribute('href').catch(()=>null)
  res.push('href Configurações: ' + href)
  await a.getByRole('menuitem', { name: /Configura/i }).click().catch(()=>{})
  await a.waitForURL(/\/super\/plataformas\/[0-9a-f-]{8,}/, { timeout: 8000 }).catch(()=>{})
  res.push('clique navegou: ' + /\/super\/plataformas\/[0-9a-f-]{8,}/.test(a.url()))
  if (href && !/\/super\/plataformas\/[0-9a-f-]{8,}/.test(a.url())) { await a.goto('http://localhost:3000' + href, { waitUntil: 'domcontentloaded' }) }
  await a.waitForTimeout(1800)
  res.push('URL config: ' + a.url())
  const pg = await a.locator('body').innerText()
  res.push('página: Editar plataforma: ' + /Editar plataforma/i.test(pg))
  res.push('página: Visualização: ' + /Visualiza[çc][ãa]o/i.test(pg))
  res.push('página: Excluir plataforma: ' + /Excluir plataforma/i.test(pg))
  res.push('página: KPIs (Estudantes/Simulados): ' + (/Estudantes/i.test(pg) && /Simulados/i.test(pg)))
  res.push('página: Abrir painel: ' + /Abrir painel/i.test(pg))
  await a.screenshot({ path: 'scripts/_super_config.png', fullPage: false })
  res.push('erros: ' + (errs.length ? errs.join(' | ') : 'nenhum'))
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,300)) } finally { console.log(res.join('\n')); await b.close() }
