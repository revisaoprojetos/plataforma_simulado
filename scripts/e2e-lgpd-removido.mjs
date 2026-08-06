import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true }); const res = []
try {
  const p = await b.newPage({ viewport: { width: 1300, height: 860 } }); p.setDefaultTimeout(25000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200)
  await p.locator('input[type="email"]').fill('joao@gmail.com')
  await p.getByRole('button', { name: /continuar/i }).click()
  await p.waitForURL(/\/aluno/, { timeout: 25000 }).catch(()=>{}); await p.waitForTimeout(2000)
  // abre menu do avatar
  await p.locator('header').getByRole('button').last().click().catch(()=>{}); await p.waitForTimeout(500)
  const body = await p.locator('body').innerText()
  res.push('menu SEM "Privacidade e dados": ' + !/Privacidade e dados/i.test(body))
  res.push('menu ainda tem Trocar/Sair: ' + (/Trocar de plataforma/i.test(body) && /Sair/i.test(body)))
  // acesso direto à URL removida
  const resp = await p.goto('http://localhost:3000/aluno/privacidade', { waitUntil: 'domcontentloaded' }).catch(()=>null)
  await p.waitForTimeout(1500)
  const txt = await p.locator('body').innerText()
  res.push('/aluno/privacidade -> HTTP ' + (resp ? resp.status() : '?') + ' | 404/não encontrado: ' + /404|não pode ser encontrada|not found|This page could/i.test(txt))
} catch(e){ res.push('ERRO: '+String(e.message||e).slice(0,200)) } finally { console.log(res.join('\n')); await b.close() }
