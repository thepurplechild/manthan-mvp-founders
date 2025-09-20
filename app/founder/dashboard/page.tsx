import Link from 'next/link';

export default async function FounderDashboardPage(): Promise<JSX.Element> {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold">Founder Command Center</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Review projects, manage platform mandates, and monitor deal progress. All tools on this page are
          restricted to founder accounts.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-medium">Project Reviews</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Inspect project uploads, download generated assets, and update the deal pipeline for each project.
          </p>
          <Link
            href="/founder/projects"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            View projects
          </Link>
        </article>
        <article className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-medium">Platform Mandates</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Capture market intelligence, tag mandates, and keep sourcing notes centralised for the team.
          </p>
          <Link
            href="/founder/mandates"
            className="mt-4 inline-flex items-center justify-center rounded-md border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
          >
            Manage mandates
          </Link>
        </article>
      </section>
    </div>
  );
}
