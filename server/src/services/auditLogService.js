import { supabaseAdmin } from './supabaseAdmin.js';

export async function writeAuditLog({ userId, action, entityType, entityId }) {
  const { error } = await supabaseAdmin.from('activity_logs').insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
  });

  if (error) {
    console.error('Audit log error:', error.message);
  }
}
