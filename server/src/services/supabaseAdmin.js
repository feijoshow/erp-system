import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
export const supabaseAuth = createClient(env.supabaseUrl, env.supabaseAnonKey);
