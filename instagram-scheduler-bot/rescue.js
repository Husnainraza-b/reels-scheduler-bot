require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function rescue() {
  const { data, error } = await supabase
    .from('queue')
    .update({ status: 'pending', scheduled_for: '2099-12-31T23:59:59.000Z' })
    .eq('status', 'calculating')
    .select();
  console.log('Rescued items:', data?.length);
  if (error) console.error(error);
}
rescue();
