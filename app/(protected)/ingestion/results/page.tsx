import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientView from './view'

export default async function ResultsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const sp = await searchParams
  const projectId = (Array.isArray(sp.projectId) ? sp.projectId[0] : sp.projectId) as string | undefined
  if (!projectId) {
    redirect('/dashboard')
  }

  return <ClientView projectId={projectId} />
}
