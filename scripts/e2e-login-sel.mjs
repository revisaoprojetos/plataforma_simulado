import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } }); p.setDefaultTimeout(30000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
  res.push('aluno NEUTRO (sem "Revisão"): ' + !/Revis[aã]o|curseduca|Ensino Jur/i.test(await p.locator('body').innerText()))
  // login admin -> seletor
  await p.getByRole('button', { name: /^Admin$/ }).click(); await p.waitForTimeout(600)
  await p.locator('input[type=email]').fill('admin@teste.com'); await p.locator('input[type=password]').fill('Admin@2026')
  await p.getByRole('button', { name: /entrar no painel/i }).click()
  await p.waitForTimeout(4000)
  res.push('seletor pós-login: ' + /Escolha a plataforma/i.test(await p.locator('body').innerText()))
  await p.screenshot({ path: 'scripts/_login-sel.png' })
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
