import { chromium } from 'playwright'
const b = await chromium.launch({ headless: true })
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(30000)
  await p.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3500)
  const particulas = await p.evaluate(() => document.querySelectorAll('span[style*="floatUp"]').length)
  console.log('partículas no DOM:', particulas)
  await p.screenshot({ path: 'scripts/_login-final.png' })
  console.log('screenshot ok')
} catch(e){ console.log('ERRO: '+String(e.message||e).slice(0,200)) } finally { await b.close() }
