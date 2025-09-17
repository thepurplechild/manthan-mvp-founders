"use client"
import React from 'react'

import type { JSONValue } from '@/types/common'

export function OutputList({ outputs }: { outputs: { step: string; payload: JSONValue; created_at?: string }[] }) {
  if (!outputs || outputs.length === 0) return <div className="text-sm text-slate-500">No outputs yet.</div>
  return (
    <div className="space-y-3">
      {outputs.map((o, i) => (
        <div key={i} className="border rounded p-3">
          <div className="text-sm font-medium text-slate-700 mb-1">{o.step}</div>
          <pre className="text-xs bg-slate-50 p-2 rounded overflow-auto max-h-60">{JSON.stringify(o.payload, null, 2)}</pre>
        </div>
      ))}
    </div>
  )
}
