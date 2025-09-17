import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white px-6">
      <div className="text-center max-w-md">
        <h2 className="text-3xl font-bold mb-3">Project not found</h2>
        <p className="text-purple-200 mb-6">We couldn’t locate that project. It may have been removed or the link is incorrect.</p>
        <Link href="/dashboard" className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-4 py-2 rounded-xl text-white">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

