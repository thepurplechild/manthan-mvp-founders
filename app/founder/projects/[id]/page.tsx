import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import ProjectDownloadList from '@/components/founder/ProjectDownloadList';
import DealPipelineSection from '@/components/founder/DealPipelineSection';
import type { DealPipelineEntry } from '@/components/founder/DealPipelineTable';
import { getRlsServerClient, getServerClient } from '@/lib/supabase/server';
import { DealEntrySchema } from '@/lib/zod/deal';

type DealPipelineFormState = {
  ok: boolean;
  error: string | null;
};

type DownloadAction = (formData: FormData) => Promise<void>;

function extractStorageTarget(path: string): { bucket: string; objectPath: string } {
  const segments = path.split('/');
  const bucket = segments.shift();
  if (!bucket || segments.length === 0) {
    throw new Error('Invalid storage path');
  }
  return { bucket, objectPath: segments.join('/') };
}

async function getSignedDownloadUrlAction(formData: FormData): Promise<void> {
  'use server';
  const path = formData.get('path');
  if (typeof path !== 'string' || path.trim().length === 0) {
    throw new Error('Missing file path');
  }

  const { bucket, objectPath } = extractStorageTarget(path);
  const supabase = getServerClient();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, 120);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? 'Unable to generate signed URL');
  }

  redirect(data.signedUrl as any);
}

async function createDealEntryAction(
  _prevState: DealPipelineFormState,
  formData: FormData
): Promise<DealPipelineFormState> {
  'use server';

  const projectId = formData.get('project_id');
  if (typeof projectId !== 'string' || projectId.length === 0) {
    return { ok: false, error: 'Project identifier missing.' };
  }

  const parsed = DealEntrySchema.safeParse({
    target_buyer_name: formData.get('target_buyer_name'),
    status: formData.get('status'),
    feedback_notes: formData.get('feedback_notes') ?? undefined,
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid entry.';
    return { ok: false, error: message };
  }

  const supabase = await getRlsServerClient();
  const { error } = await supabase.from('deal_pipeline').insert({
    project_id: projectId,
    target_buyer_name: parsed.data.target_buyer_name,
    status: parsed.data.status,
    feedback_notes: parsed.data.feedback_notes ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/founder/projects/${projectId}`);
  return { ok: true, error: null };
}

interface DownloadItem {
  id: string;
  name: string;
  path: string;
  createdAt?: string | null;
}

export default async function ProjectReviewPage({ params }: { params: Promise<{ id: string }> }): Promise<JSX.Element> {
  const { id } = await params;
  const supabase = await getRlsServerClient();

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, title, logline, synopsis, owner_id, metadata')
    .eq('id', id)
    .maybeSingle();

  if (projectError || !project) {
    notFound();
  }

  const ownerId = project.owner_id as string | null;
  const { data: owner } = ownerId
    ? await supabase
        .from('profiles')
        .select('id, name, email')
        .eq('id', ownerId)
        .maybeSingle()
    : { data: null };

  const { data: uploads } = await supabase
    .from('script_uploads')
    .select('id, storage_path, created_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false });

  const { data: assets } = await supabase
    .from('generated_assets')
    .select('id, storage_path, asset_type, created_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false });

  const { data: pipelineEntries } = await supabase
    .from('deal_pipeline')
    .select('id, target_buyer_name, status, feedback_notes, created_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false });

  const sourceFiles: DownloadItem[] = (uploads || []).map((upload) => ({
    id: upload.id,
    name: upload.storage_path.split('/').pop() || upload.storage_path,
    path: upload.storage_path,
    createdAt: upload.created_at,
  }));

  const generatedFiles: DownloadItem[] = (assets || []).map((asset) => ({
    id: asset.id,
    name: asset.storage_path.split('/').pop() || asset.storage_path,
    path: asset.storage_path,
    createdAt: asset.created_at,
  }));

  const dealEntries: DealPipelineEntry[] = (pipelineEntries || []).map((entry) => ({
    id: entry.id,
    target_buyer_name: entry.target_buyer_name,
    status: entry.status,
    feedback_notes: entry.feedback_notes,
    created_at: entry.created_at,
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <section className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold">{project.title || 'Untitled project'}</h1>
            {project.logline ? (
              <p className="text-sm text-muted-foreground">{project.logline}</p>
            ) : null}
            {project.synopsis ? (
              <p className="text-sm text-muted-foreground/80">{project.synopsis}</p>
            ) : null}
          </div>
          {owner ? (
            <div className="rounded-md border border-border/60 bg-background px-4 py-3 text-sm">
              <p className="font-medium">Creator</p>
              <p>{owner.name ?? 'Unknown'}</p>
              <p className="text-muted-foreground">{owner.email ?? '—'}</p>
            </div>
          ) : null}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <ProjectDownloadList
          title="Source files"
          files={sourceFiles}
          emptyMessage="No source scripts uploaded yet."
          downloadAction={getSignedDownloadUrlAction as DownloadAction}
        />
        <ProjectDownloadList
          title="Generated assets"
          files={generatedFiles}
          emptyMessage="No AI-generated assets available yet."
          downloadAction={getSignedDownloadUrlAction as DownloadAction}
        />
      </div>

      <DealPipelineSection
        projectId={id}
        entries={dealEntries}
        createEntryAction={createDealEntryAction}
      />
    </div>
  );
}
