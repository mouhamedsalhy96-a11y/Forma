import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";

export async function serverSupabase() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        for (const { name, value, options } of values) store.set(name, value, options);
      },
    },
  });
}
