import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white px-6">
      <div className="text-center max-w-md">
        <h2 className="text-3xl font-bold mb-3">Not found or access denied</h2>
        <p className="text-purple-200 mb-6">The requested project is unavailable, or you don’t have permission to view it.</p>
        <Link href="/founder/dashboard" className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 px-4 py-2 rounded-xl text-white">
          Back to Founder Dashboard
        </Link>
      </div>
    </div>
  );
}

