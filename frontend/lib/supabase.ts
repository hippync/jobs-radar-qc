import { createClient } from "@supabase/supabase-js";

// Fallback values allow the Supabase client to be created during `next build`
// even when env vars aren't set (CI without secrets). Actual API calls will
// fail gracefully — pages already handle empty/null data.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder";

export const supabase = createClient(url, key);
