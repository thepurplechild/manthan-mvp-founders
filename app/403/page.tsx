export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Access denied</h1>
        <p className="mt-4 text-muted-foreground">
          You need a founder account to view this content. Please contact your workspace administrator if you believe
          this is a mistake.
        </p>
      </div>
    </main>
  );
}
