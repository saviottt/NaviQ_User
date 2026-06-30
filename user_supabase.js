import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://hwjnqxwchhgrmectfols.supabase.co';
const SUPABASE_KEY = 'sb_publishable_v1vRYV60lc5thTLPzzjb1A_ZiBiEyZy';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);