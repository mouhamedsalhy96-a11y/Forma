export function supabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    if (new URL(url).protocol !== "https:") return null;
  } catch { return null; }
  if (!key.startsWith("sb_publishable_") && !key.startsWith("eyJ")) return null;
  return { url, key };
}
