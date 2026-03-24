import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Warn instead of throw so builds succeed without env vars
  console.warn("Missing Supabase environment variables — database calls will fail at runtime");
}

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseKey ?? "placeholder"
);
