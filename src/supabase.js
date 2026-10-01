import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configurationError = "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env";
export const supabase = url && anonKey ? createClient(url, anonKey) : null;