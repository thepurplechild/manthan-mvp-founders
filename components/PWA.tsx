'use client'

import { useEffect } from 'react'

export default function PWA() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  const saver = (navigator as unknown as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
    if (saver) {
      document.documentElement.classList.add('data-saver')
    }
  }, [])
  return null
}
