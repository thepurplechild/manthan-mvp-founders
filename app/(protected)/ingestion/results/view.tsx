"use client"
import React, { useMemo } from 'react'
import { usePipelineProgress } from '@/hooks/usePipelineProgress'
import { ProgressStepper } from '@/components/pipeline/ProgressStepper'
import { StepCard } from '@/components/pipeline/StepCard'
import { ErrorToast } from '@/components/pipeline/ErrorToast'

export default function ClientView({ projectId }: { projectId: string }) {
  const { state, error, retry, getSignedUrl } = usePipelineProgress(projectId)

  const steps = useMemo(() => {
    const map: Record<string, string> = {
      core_extraction: 'Core Elements',
      character_bible: 'Characters',
      market_adaptation: 'Market',
      package_assembly: 'Pitch Content',
      visuals: 'Visuals',
      final_package: 'Assembly',
    }
    return (state?.steps || []).map((s) => ({ key: s.name, label: map[s.name] || s.name, status: s.status as 'pending'|'running'|'succeeded'|'failed'|'skipped', progress: s.status==='succeeded'?100:s.status==='running'?50:0 }))
  }, [state])

  const done = state && (state.status === 'succeeded' || state.steps.every((s) => s.status==='succeeded'))

  return (
    <div className="container mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-4">Processing Pipeline</h1>
      <div className="mb-6">
        <ProgressStepper steps={steps} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(state?.steps || []).map((s) => (
          <StepCard key={s.name} title={s.name} status={(s.status as 'pending'|'running'|'succeeded'|'failed'|'skipped') || 'pending'} onRetry={retry}>
            {s.error && <div className="text-red-700">{s.error}</div>}
            {s.output && <pre className="text-xs bg-slate-50 rounded p-2 overflow-auto max-h-48">{JSON.stringify(s.output, null, 2)}</pre>}
          </StepCard>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3 items-center">
        {!done && (
          <div className="text-slate-600 text-sm">Running… latest progress {state?.progress ?? 0}%</div>
        )}
        {done && (
          <>
            <span className="text-green-700 font-medium">Completed</span>
            {(state?.assets || []).map((a, i) => (
              <AssetButton key={i} path={a.storage_path || ''} kind={a.kind || ''} getSignedUrl={getSignedUrl} />
            ))}
            <a href={`/projects/${state?.projectId}`} className="px-3 py-1.5 rounded bg-slate-800 text-white text-sm">View Full Analysis</a>
            <a href="/upload" className="px-3 py-1.5 rounded bg-slate-200 text-slate-900 text-sm">Create Another Project</a>
          </>
        )}
      </div>

      <ErrorToast message={error} />
    </div>
  )
}

function AssetButton({ path, kind, getSignedUrl }: { path: string; kind: string; getSignedUrl: (p: string) => Promise<string> }) {
  const label = kind === 'pdf_pitch' ? 'Download Pitch Deck (PDF)' : kind === 'pptx_pitch' ? 'Download Presentation (PPTX)' : 'Executive Summary'
  const onClick = async () => {
    const url = await getSignedUrl(path)
    const a = document.createElement('a')
    a.href = url
    a.download = path.split('/').pop() || 'download'
    a.click()
  }
  return <button className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm" onClick={onClick}>{label}</button>
}
