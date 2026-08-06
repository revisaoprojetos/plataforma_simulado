import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true })
try {
  const p = await b.newPage({ viewport: { width: 1360, height: 860 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(30000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500)
  const blobs = await p.evaluate(() => document.querySelectorAll('[style*="drift"],[style*="breathe"]').length)
  console.log('véus animados no DOM:', blobs)
  await p.screenshot({ path: 'scripts/_bg1.png' })
  await p.waitForTimeout(6000) // deixa a animação avançar
  await p.screenshot({ path: 'scripts/_bg2.png' })
  console.log('screenshots ok')
} catch(e){ console.log('ERRO: '+String(e.message||e).slice(0,200)) } finally { await b.close() }
