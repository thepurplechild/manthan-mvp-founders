import { createClient } from '@/lib/supabase/server'
// import Link from 'next/link'

export default async function AdminIngestions() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return (
      <div className="p-6">Sign in required</div>
    )
  }
  const { data: rows } = await supabase.from('ingestions').select('*').order('created_at', { ascending: false }).limit(50)

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
}
