import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true })
try {
  const p = await b.newPage()
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await p.waitForTimeout(1500)
  const email = await p.locator('input[type="email"]').count()
  const senha = await p.locator('input[type="password"]').count()
  const adminBtn = await p.getByRole('button', { name: /admin/i }).count()
  const gridSelecao = await p.getByText(/escolha sua plataforma/i).count() // seletor PRÉ-login (não deve existir mais)
  console.log('SMOKE login: email='+email+' senha='+senha+' adminBtn='+adminBtn+' seletorPreLogin='+gridSelecao)
  console.log('title:', await p.title())
  await p.screenshot({ path: 'scripts/_e2e-login.png' })
} finally { await b.close() }
