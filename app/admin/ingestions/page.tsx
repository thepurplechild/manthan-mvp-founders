import { getServerClient } from '@/lib/supabase/server'
// import Link from 'next/link'

// Force dynamic rendering to prevent static generation issues
export const dynamic = 'force-dynamic'

export default async function AdminIngestions() {
  try {
    const supabase = getServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      return (
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Authentication Error</h2>
            <p className="text-red-700">Failed to authenticate: {authError.message}</p>
          </div>
        </div>
      )
    }

    if (!user) {
      return (
        <div className="p-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-yellow-800 mb-2">Access Required</h2>
            <p className="text-yellow-700">Please sign in to access the admin panel.</p>
          </div>
        </div>
      )
    }

    const { data: rows, error: queryError } = await supabase
      .from('ingestions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (queryError) {
      return (
        <div className="p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-red-800 mb-2">Database Error</h2>
            <p className="text-red-700">Failed to fetch ingestions: {queryError.message}</p>
          </div>
        </div>
      )
    }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Ingestions</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-700">
              <th className="py-2 pr-4">ID</th>
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">Project</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Progress</th>
              <th className="py-2 pr-4">Created</th>
              <th className="py-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r: { id: string; user_id: string; project_id?: string | null; status: string; progress: number; created_at: string }) => (
              <tr key={r.id} className="border-b border-gray-800">
                <td className="py-2 pr-4 font-mono text-xs">{r.id}</td>
                <td className="py-2 pr-4 text-xs">{r.user_id?.slice(0,8)}</td>
                <td className="py-2 pr-4 text-xs">{r.project_id || '—'}</td>
                <td className="py-2 pr-4">{r.status}</td>
                <td className="py-2 pr-4">{r.progress}%</td>
                <td className="py-2 pr-4 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td className="py-2 pr-4">
                  <form action={`/api/ingestions/run`} method="post">
                    <input type="hidden" name="ingestion_id" value={r.id} />
                    <button className="px-3 py-1 rounded bg-purple-600 text-white text-xs" formAction="#" onClick={async (e) => {
                      e.preventDefault()
                      await fetch('/api/ingestions/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ingestion_id: r.id }) })
                      location.reload()
                    }}>Retry</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  } catch (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-red-800 mb-2">System Error</h2>
          <p className="text-red-700">
            An unexpected error occurred: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <p className="text-red-600 text-sm mt-2">
            This may be due to missing environment variables or configuration issues.
          </p>
        </div>
      </div>
    )
  }
}
