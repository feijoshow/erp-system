import { supabaseAdmin } from './supabaseAdmin.js';

export async function writeAuditLog({ userId, action, entityType, entityId, note }) {
  const normalizedNote = typeof note === 'string' ? note.trim() : '';
  const actionMessage = normalizedNote ? `${action}: ${normalizedNote}` : action;

  const { error } = await supabaseAdmin.from('activity_logs').insert({
    user_id: userId,
    action: actionMessage,
    entity_type: entityType,
    entity_id: entityId,
  });

  if (error) {
    console.error('Audit log error:', error.message);
  }
}
