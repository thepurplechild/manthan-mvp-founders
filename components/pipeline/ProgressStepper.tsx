"use client"
import React from 'react'

export type StepDisplay = { key: string; label: string; status: 'pending'|'running'|'succeeded'|'failed'|'skipped'; progress?: number }

export function ProgressStepper({ steps }: { steps: StepDisplay[] }) {
  return (
    <ol className="grid grid-cols-1 md:grid-cols-6 gap-3">
      {steps.map((s, idx) => (
        <li key={s.key} className="flex flex-col items-start">
          <div className={`text-sm font-medium ${s.status==='succeeded'?'text-green-600':s.status==='failed'?'text-red-600':s.status==='running'?'text-blue-600':'text-slate-500'}`}>{idx+1}. {s.label}</div>
          <div className="w-full h-2 bg-slate-200 rounded">
            <div className={`h-2 rounded ${s.status==='failed'?'bg-red-500':s.status==='succeeded'?'bg-green-500':'bg-blue-500'}`} style={{ width: `${s.progress ?? (s.status==='succeeded'?100:s.status==='running'?50:0)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  )
}

