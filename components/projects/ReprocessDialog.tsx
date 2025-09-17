"use client"
import React, { useState } from 'react'

export function ReprocessDialog({ projectId, onDone }: { projectId: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const [targetPlatform, setTargetPlatform] = useState('Netflix India')
  const [tone, setTone] = useState('Premium, grounded, Indian sensibility')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/projects/reprocess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, options: { targetPlatform, tone } }),
      })
      if (!res.ok) throw new Error(`Reprocess failed: ${res.status}`)
      setOpen(false)
      onDone?.()
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e);
      setError(error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={()=>setOpen(true)} className="px-3 py-1.5 rounded bg-purple-600 text-white text-sm">Re-process</button>
      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true">
          <div className="bg-white rounded shadow max-w-md w-full p-4">
            <h3 className="text-lg font-semibold mb-2">Re-process with New Profile</h3>
            <label className="block text-sm text-slate-700 mb-1">Target Platform</label>
            <input className="w-full border rounded px-2 py-1 mb-3" value={targetPlatform} onChange={e=>setTargetPlatform(e.target.value)} />
            <label className="block text-sm text-slate-700 mb-1">Tone</label>
            <input className="w-full border rounded px-2 py-1 mb-3" value={tone} onChange={e=>setTone(e.target.value)} />
            {error && <div className="text-red-600 text-sm mb-2">{error}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={()=>setOpen(false)} className="px-3 py-1.5 rounded bg-slate-200 text-slate-900 text-sm">Cancel</button>
              <button onClick={submit} disabled={loading} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm">{loading?'Re-processing…':'Run'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

