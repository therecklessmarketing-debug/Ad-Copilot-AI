const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function run() {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: settings } = await supabase.from('meta_settings').select('*');
  console.log('meta_settings:', settings);
  
  const { data: clients } = await supabase.from('clients').select('id, name, ad_account_id');
  console.log('clients:', clients);
}
run();
