import { revalidatePath } from 'next/cache';
import { MandateSchema } from '@/lib/zod/mandates';
import MandateForm, { type MandateFormState } from '@/components/founder/MandateForm';
import { getRlsServerClient } from '@/lib/supabase/server';

interface MandateRow {
  id: string;
  platform_name: string;
  mandate_description: string;
  tags: string[] | null;
  source: string | null;
  created_at: string;
}

async function fetchMandates(): Promise<MandateRow[]> {
  const supabase = await getRlsServerClient();
  const { data, error } = await supabase
    .from('platform_mandates')
    .select('id, platform_name, mandate_description, tags, source, created_at')
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as MandateRow[];
}

async function createMandateAction(
  _prevState: MandateFormState,
  formData: FormData
): Promise<MandateFormState> {
  'use server';

  const input = {
    platform_name: formData.get('platform_name'),
    mandate_description: formData.get('mandate_description'),
    tags: formData.get('tags'),
    source: formData.get('source'),
  };

  const parsed = MandateSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid input.';
    return { ok: false, error: message };
  }

  const supabase = await getRlsServerClient();
  const { error } = await supabase.from('platform_mandates').insert({
    platform_name: parsed.data.platform_name,
    mandate_description: parsed.data.mandate_description,
    tags: parsed.data.tags,
    source: parsed.data.source || null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/founder/mandates');
  return { ok: true, error: null };
}

export default async function MandatesPage(): Promise<JSX.Element> {
  const mandates = await fetchMandates();

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold">Platform mandates</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Capture strategic mandates for target platforms. Only founders can create and view mandates.
        </p>
      </header>

      <MandateForm action={createMandateAction} />

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent mandates</h2>
        {mandates.length === 0 ? (
          <p className="text-sm text-muted-foreground">No mandates recorded yet.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Platform</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Description</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Tags</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Source</th>
                  <th scope="col" className="px-4 py-2 text-left font-medium text-muted-foreground">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mandates.map((mandate) => (
                  <tr key={mandate.id} className="bg-card">
                    <td className="px-4 py-3 font-medium text-foreground">{mandate.platform_name}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{mandate.mandate_description}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {(mandate.tags && mandate.tags.length > 0)
                        ? mandate.tags.join(', ')
                        : <span className="italic text-muted-foreground/70">None</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {mandate.source || <span className="italic text-muted-foreground/70">Unknown</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(mandate.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
