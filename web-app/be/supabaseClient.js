import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://tdulzwibmbytboxrlxbw.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkdWx6d2libWJ5dGJveHJseGJ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTQ5OTIyOSwiZXhwIjoyMDY1MDc1MjI5fQ.o97KW1yEDiKyEfDiCjA4zHEaH2gnVV663NoiNeKPXS0";

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase URL and Key must be set in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);
if (!supabase) {
  throw new Error('Failed to create Supabase client');
}

module.exports = { supabase };