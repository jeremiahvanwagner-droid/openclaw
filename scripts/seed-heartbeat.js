// File: scripts/seed-heartbeat.js
const { createClient } = require('@supabase/supabase-js');
const creds = require('../credentials/supabase-connection.json');

const supabase = createClient(creds.url, creds.key);

async function updateHeartbeat(agentId) {
  const { data, error } = await supabase.rpc('update_agent_heartbeat', { p_agent_id: agentId });
  if (error) {
    console.error(`Error updating heartbeat for ${agentId}:`, error);
  } else {
    console.log(`Heartbeat updated for ${agentId}:`, data);
  }
}

(async () => {
  await updateHeartbeat('d1_ceo');
  await updateHeartbeat('d1_cto');
})();