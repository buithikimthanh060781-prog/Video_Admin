// Supabase client config
// Chỉ dùng anon/public key. KHÔNG đặt service_role key ở frontend.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://laoxrsdemwvwcpqjqecq.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_HBbNUGykr-mqk0oDBMrAIA_PyBQ9fmM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
