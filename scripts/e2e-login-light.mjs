import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(30000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500)
  res.push('sem abas Aluno/Admin no card: ' + !(await p.locator('.rounded-xl.border').filter({ hasText: 'Admin' }).count() > 1))
  res.push('botão Admin no canto: ' + (await p.getByRole('button', { name: /^Admin$/ }).count()))
  await p.screenshot({ path: 'scripts/_light-aluno.png' })
  // clica no Admin do canto
  await p.getByRole('button', { name: /^Admin$/ }).click(); await p.waitForTimeout(700)
  res.push('modo admin (senha visível): ' + (await p.locator('input[type=password]').count() > 0))
  res.push('canto agora diz "Área do aluno": ' + (await p.getByRole('button', { name: /Área do aluno/i }).count()))
  await p.screenshot({ path: 'scripts/_light-admin.png' })
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
