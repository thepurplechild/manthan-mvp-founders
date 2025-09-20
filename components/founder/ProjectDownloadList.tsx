'use client';

import { format } from 'date-fns';
import { useFormStatus } from 'react-dom';

interface FileItem {
  id: string;
  name: string;
  path: string;
  createdAt?: string | null;
}

interface ProjectDownloadListProps {
  title: string;
  files: FileItem[];
  emptyMessage: string;
  downloadAction: (formData: FormData) => Promise<void>;
}

function DownloadButton(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="inline-flex items-center justify-center rounded-md border border-primary px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={pending}
    >
      {pending ? 'Preparing…' : 'Download'}
    </button>
  );
}

export default function ProjectDownloadList({
  title,
  files,
  emptyMessage,
  downloadAction,
}: ProjectDownloadListProps): JSX.Element {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
      <header>
        <h3 className="text-lg font-medium">{title}</h3>
      </header>
      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="space-y-3">
          {files.map((file) => (
            <li key={file.id} className="flex flex-col gap-2 rounded border border-border/60 bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{file.name}</p>
                {file.createdAt ? (
                  <p className="text-xs text-muted-foreground">
                    Uploaded {format(new Date(file.createdAt), 'PPP p')}
                  </p>
                ) : null}
              </div>
              <form action={downloadAction} className="sm:flex sm:items-center sm:gap-3">
                <input type="hidden" name="path" value={file.path} />
                <DownloadButton />
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
