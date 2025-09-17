import { sanitizeHtml } from '../lib/sanitize'

const dirty = `<img src=x onerror=alert(1)><a href="javascript:alert(2)">x</a>`
const clean = sanitizeHtml(dirty)
console.log('Sanitized:', clean)
if (/onerror|javascript:/i.test(clean)) {
  throw new Error('DOMPurify failed to sanitize dangerous content')
}
console.log('✅ DOMPurify smoke test passed')

