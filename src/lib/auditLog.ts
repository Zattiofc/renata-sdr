import { supabase } from '@/integrations/supabase/client';

export const logAuditEvent = async (
  action: string,
  entityType: string,
  entityId?: string,
  details?: Record<string, any>
) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('audit_logs').insert({
      user_id: user.id,
      user_email: user.email,
      action,
      entity_type: entityType,
      entity_id: entityId || null,
      details: details || {},
    } as any);
  } catch (error) {
    console.error('[Audit] Failed to log event:', error);
  }
};
