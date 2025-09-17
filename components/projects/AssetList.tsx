"use client"
import React from 'react'

export function AssetList({ assets, onShare }: { assets: { storage_path?: string; kind?: string; created_at?: string }[]; onShare: (p: string) => Promise<void> }) {
  if (!assets || assets.length === 0) return <div className="text-sm text-slate-500">No documents yet.</div>
  return (
    <ul className="divide-y divide-slate-200 rounded border">
      {assets.map((a, i) => (
        <li key={i} className="p-3 flex items-center justify-between">
          <div>
            <div className="font-medium text-slate-800">{label(a.kind)}</div>
            <div className="text-xs text-slate-500">{a.storage_path}</div>
          </div>
          <div className="flex gap-2">
            <a className="px-2 py-1 rounded bg-blue-600 text-white text-xs" href={`/api/assets/share`} onClick={async (e)=>{e.preventDefault(); if (a.storage_path) await onShare(a.storage_path)}}>Share</a>
          </div>
        </li>
      ))}
    </ul>
  )
}

function label(kind?: string) {
  switch (kind) {
    case 'pdf_pitch': return 'Pitch Deck (PDF)'
    case 'pptx_pitch': return 'Presentation (PPTX)'
    case 'exec_summary': return 'Executive Summary'
    default: return kind || 'Asset'
  }
}

