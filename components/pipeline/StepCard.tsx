"use client"
import React from 'react'

export function StepCard({
  title,
  status,
  children,
  onRetry,
}: {
  title: string
  status: 'pending'|'running'|'succeeded'|'failed'|'skipped'
  children?: React.ReactNode
  onRetry?: () => void
}) {
  const color = status==='succeeded'?'border-green-500':status==='failed'?'border-red-500':status==='running'?'border-blue-500':'border-slate-300'
  return (
    <div className={`border ${color} rounded p-4 bg-white shadow-sm`}
      role="region" aria-label={`${title} status ${status}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-slate-800">{title}</h3>
        <div className={`text-sm ${status==='succeeded'?'text-green-600':status==='failed'?'text-red-600':status==='running'?'text-blue-600':'text-slate-500'}`}>{status}</div>
      </div>
      <div className="text-sm text-slate-700">
        {children}
      </div>
      {status==='failed' && onRetry && (
        <div className="mt-3">
          <button onClick={onRetry} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">Retry Step</button>
        </div>
      )}
    </div>
  )
}

