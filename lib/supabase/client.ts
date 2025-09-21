import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('@supabase/ssr: Your project\'s URL and API key are required to create a Supabase client!');
  }

  return createBrowserClient(url, key);
}
