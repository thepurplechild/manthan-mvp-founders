import { loadPdfjs } from '../lib/pdf/loader'
import fs from 'node:fs'
import path from 'node:path'

async function main() {
  const pdfjs = await loadPdfjs()
  const sample = path.join(process.cwd(), 'scripts', 'fixtures', 'sample.pdf')
  if (!fs.existsSync(sample)) {
    console.warn('No sample.pdf found — create scripts/fixtures/sample.pdf to fully test.')
    console.log('✅ PDF.js loader import OK')
    return
  }
  const data = new Uint8Array(fs.readFileSync(sample))
  const task = (pdfjs as any).getDocument({ data, isEvalSupported: false, useSystemFonts: false })
  const doc = await task.promise
  console.log('Pages:', doc.numPages)
  await doc.destroy()
  console.log('✅ PDF.js smoke test passed')
}

main().catch((e) => {
  console.error('❌ PDF.js smoke test failed:', e)
  process.exit(1)
})

