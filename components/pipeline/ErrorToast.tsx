"use client"
import React, { useEffect, useState } from 'react'

export function ErrorToast({ message }: { message: string | null }) {
  const [open, setOpen] = useState(false)
  useEffect(()=>{ setOpen(!!message) }, [message])
  if (!message || !open) return null
  return (
    <div className="fixed bottom-4 right-4 max-w-sm bg-red-600 text-white px-4 py-3 rounded shadow-lg" role="status" aria-live="polite">
      <div className="font-medium">Something went wrong</div>
      <div className="text-sm opacity-90 mt-1">{message}</div>
      <button className="mt-2 text-sm underline" onClick={()=>setOpen(false)} aria-label="Dismiss">Dismiss</button>
    </div>
  )
}

