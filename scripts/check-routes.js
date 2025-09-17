/*
  Scans app route pages and reports canonical paths.
  Ignores route groups like (group) and warns on duplicates.
*/
const fs = require('fs')
const path = require('path')

const appDir = path.join(process.cwd(), 'app')
/** @type {Record<string,string[]>} */
const routes = {}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full)
    } else if (entry.isFile() && entry.name === 'page.tsx') {
      const rel = path.relative(appDir, full)
      const parts = rel.split(path.sep)
      parts.pop() // remove page.tsx
      const normalized = '/' + parts.filter(p => !/^\(.*\)$/.test(p)).join('/')
      routes[normalized] = routes[normalized] || []
      routes[normalized].push(rel)
    }
  }
}

if (fs.existsSync(appDir)) {
  walk(appDir)
}

const list = Object.entries(routes).sort(([a],[b])=>a.localeCompare(b))
console.log('Discovered routes:')
for (const [route, files] of list) {
  const dupMark = files.length > 1 ? ' (DUPLICATE!)' : ''
  console.log(` - ${route}${dupMark}`)
  if (files.length > 1) {
    for (const f of files) console.log(`   * ${f}`)
  }
}

const dupes = list.filter(([, files]) => files.length > 1)
if (dupes.length) {
  console.error('\nFound duplicate route pages that resolve to the same path.')
  process.exit(1)
}
console.log('\nNo duplicate route pages found.')
