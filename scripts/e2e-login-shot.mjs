import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } }); p.setDefaultTimeout(30000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000)
  res.push('modo aluno (default): ' + /Sua plataforma de simulados|Continuar/i.test(await p.locator('body').innerText()))
  res.push('SEM marca Revisão (neutro): ' + !/Revis[aã]o|Ensino Jur/i.test(await p.locator('body').innerText()))
  await p.screenshot({ path: 'scripts/_login-aluno.png' })
  // troca pra Admin
  await p.getByRole('button', { name: /^Admin$/ }).click(); await p.waitForTimeout(900)
  res.push('modo admin (senha visível): ' + (await p.locator('input[type=password]').count() > 0))
  await p.screenshot({ path: 'scripts/_login-admin.png' })
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
