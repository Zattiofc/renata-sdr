import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-token',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- Auth ---
  const token = req.headers.get('x-api-token');
  const expectedToken = Deno.env.get('OPENCLAW_API_TOKEN');
  if (!expectedToken || token !== expectedToken) {
    return errorResponse('Unauthorized', 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json();
    const { action } = body;

    // ==================== READ ====================
    if (action === 'query') {
      // { action: "query", table: "contacts", select: "*", filters: [{col, op, val}], order: {col, asc}, limit: 50 }
      const { table, select = '*', filters = [], order, limit = 50, offset = 0 } = body;
      if (!table) return errorResponse('Missing "table"');

      let query = supabase.from(table).select(select);
      for (const f of filters) {
        if (!f.col || !f.op) continue;
        if (f.op === 'eq') query = query.eq(f.col, f.val);
        else if (f.op === 'neq') query = query.neq(f.col, f.val);
        else if (f.op === 'gt') query = query.gt(f.col, f.val);
        else if (f.op === 'gte') query = query.gte(f.col, f.val);
        else if (f.op === 'lt') query = query.lt(f.col, f.val);
        else if (f.op === 'lte') query = query.lte(f.col, f.val);
        else if (f.op === 'like') query = query.like(f.col, f.val);
        else if (f.op === 'ilike') query = query.ilike(f.col, f.val);
        else if (f.op === 'is') query = query.is(f.col, f.val);
        else if (f.op === 'in') query = query.in(f.col, f.val);
        else if (f.op === 'contains') query = query.contains(f.col, f.val);
        else if (f.op === 'containedBy') query = query.containedBy(f.col, f.val);
      }
      if (order?.col) query = query.order(order.col, { ascending: order.asc !== false });
      query = query.range(offset, offset + Math.min(limit, 500) - 1);

      const { data, error, count } = await query;
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data, count });
    }

    // ==================== INSERT ====================
    if (action === 'insert') {
      // { action: "insert", table: "contacts", data: {...} or [{...}] }
      const { table, data } = body;
      if (!table || !data) return errorResponse('Missing "table" or "data"');

      const { data: result, error } = await supabase.from(table).insert(data).select();
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data: result });
    }

    // ==================== UPDATE ====================
    if (action === 'update') {
      // { action: "update", table: "contacts", data: {...}, filters: [{col, op, val}] }
      const { table, data, filters = [] } = body;
      if (!table || !data) return errorResponse('Missing "table" or "data"');
      if (filters.length === 0) return errorResponse('Updates require at least one filter for safety');

      let query = supabase.from(table).update(data);
      for (const f of filters) {
        if (f.op === 'eq') query = query.eq(f.col, f.val);
        else if (f.op === 'in') query = query.in(f.col, f.val);
      }
      const { data: result, error } = await query.select();
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data: result });
    }

    // ==================== DELETE ====================
    if (action === 'delete') {
      // { action: "delete", table: "contacts", filters: [{col, op, val}] }
      const { table, filters = [] } = body;
      if (!table) return errorResponse('Missing "table"');
      if (filters.length === 0) return errorResponse('Deletes require at least one filter for safety');

      let query = supabase.from(table).delete();
      for (const f of filters) {
        if (f.op === 'eq') query = query.eq(f.col, f.val);
        else if (f.op === 'in') query = query.in(f.col, f.val);
      }
      const { data: result, error } = await query.select();
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data: result });
    }

    // ==================== RPC ====================
    if (action === 'rpc') {
      // { action: "rpc", function_name: "get_next_closer", params: {} }
      const { function_name, params = {} } = body;
      if (!function_name) return errorResponse('Missing "function_name"');

      const { data, error } = await supabase.rpc(function_name, params);
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data });
    }

    // ==================== SQL (readonly) ====================
    if (action === 'sql') {
      // { action: "sql", query: "SELECT ..." }
      const { query } = body;
      if (!query) return errorResponse('Missing "query"');
      if (!query.trim().toUpperCase().startsWith('SELECT')) {
        return errorResponse('Only SELECT queries allowed via sql action. Use "sql_mutation" for writes.');
      }

      const { data, error } = await supabase.rpc('execute_readonly_query', { sql_query: query });
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data });
    }

    // ==================== SQL MUTATION ====================
    if (action === 'sql_mutation') {
      // { action: "sql_mutation", query: "UPDATE ..." }
      const { query } = body;
      if (!query) return errorResponse('Missing "query"');

      const { data, error } = await supabase.rpc('execute_mutation_query', { sql_query: query });
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data });
    }

    // ==================== LIST TABLES ====================
    if (action === 'list_tables') {
      const { data, error } = await supabase.rpc('execute_readonly_query', {
        sql_query: `SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
                     FROM information_schema.tables 
                     WHERE table_schema = 'public' 
                     ORDER BY table_name`
      });
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data });
    }

    // ==================== DESCRIBE TABLE ====================
    if (action === 'describe') {
      // { action: "describe", table: "contacts" }
      const { table } = body;
      if (!table) return errorResponse('Missing "table"');

      const { data, error } = await supabase.rpc('execute_readonly_query', {
        sql_query: `SELECT column_name, data_type, is_nullable, column_default 
                     FROM information_schema.columns 
                     WHERE table_schema = 'public' AND table_name = '${table.replace(/'/g, "''")}'
                     ORDER BY ordinal_position`
      });
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data });
    }

    // ==================== INVOKE EDGE FUNCTION ====================
    if (action === 'invoke') {
      // { action: "invoke", function_name: "health-check", payload: {} }
      const { function_name, payload = {} } = body;
      if (!function_name) return errorResponse('Missing "function_name"');

      const { data, error } = await supabase.functions.invoke(function_name, { body: payload });
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data });
    }

    // ==================== HEALTH ====================
    if (action === 'health') {
      return jsonResponse({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        actions: ['query', 'insert', 'update', 'delete', 'rpc', 'sql', 'sql_mutation', 'list_tables', 'describe', 'invoke', 'health']
      });
    }

    return errorResponse(`Unknown action: "${action}". Use "health" to see available actions.`);

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[OpenClaw API]', message);
    return errorResponse(message, 500);
  }
});
