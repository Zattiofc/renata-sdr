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

/**
 * Execute SQL directly via postgres connection.
 * Supports parameterized queries: execSQL("SELECT * FROM t WHERE id = $1", ["uuid-here"])
 */
async function execSQL(query: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number; command: string }> {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) throw new Error('SUPABASE_DB_URL not configured');

  const { Pool } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
  const pool = new Pool(dbUrl, 1, true);
  const conn = await pool.connect();
  try {
    let result;
    if (params && params.length > 0) {
      // Use parameterized query — safe from injection and type coercion issues
      result = await conn.queryObject(query, params);
    } else {
      result = await conn.queryObject(query);
    }
    return {
      rows: result.rows as unknown[],
      rowCount: result.rowCount ?? 0,
      command: result.command ?? 'UNKNOWN',
    };
  } finally {
    conn.release();
    await pool.end();
  }
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
    const rawBody = await req.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('[OpenClaw API] JSON parse error:', parseErr, '| raw:', rawBody.substring(0, 500));
      return errorResponse('Invalid JSON body', 400);
    }
    const { action } = body;

    // ==================== QUERY (SELECT via SDK) ====================
    if (action === 'query') {
      const { table, select = '*', filters = [], order, limit = 50, offset = 0 } = body as any;
      if (!table) return errorResponse('Missing "table"');

      let query = supabase.from(table).select(select);
      for (const f of filters) {
        if (!f.col || !f.op) continue;
        const ops: Record<string, (q: any, c: string, v: any) => any> = {
          eq: (q: any, c: string, v: any) => q.eq(c, v),
          neq: (q: any, c: string, v: any) => q.neq(c, v),
          gt: (q: any, c: string, v: any) => q.gt(c, v),
          gte: (q: any, c: string, v: any) => q.gte(c, v),
          lt: (q: any, c: string, v: any) => q.lt(c, v),
          lte: (q: any, c: string, v: any) => q.lte(c, v),
          like: (q: any, c: string, v: any) => q.like(c, v),
          ilike: (q: any, c: string, v: any) => q.ilike(c, v),
          is: (q: any, c: string, v: any) => q.is(c, v),
          in: (q: any, c: string, v: any) => q.in(c, v),
          contains: (q: any, c: string, v: any) => q.contains(c, v),
          containedBy: (q: any, c: string, v: any) => q.containedBy(c, v),
        };
        if (ops[f.op]) query = ops[f.op](query, f.col, f.val);
      }
      if (order?.col) query = query.order(order.col, { ascending: order.asc !== false });
      query = query.range(offset, offset + Math.min(limit, 500) - 1);

      const { data, error, count } = await query;
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data, count });
    }

    // ==================== INSERT (SDK) ====================
    if (action === 'insert') {
      const { table, data } = body as any;
      if (!table || !data) return errorResponse('Missing "table" or "data"');
      const { data: result, error } = await supabase.from(table).insert(data).select();
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data: result });
    }

    // ==================== UPDATE (SDK) ====================
    if (action === 'update') {
      const { table, data, filters = [] } = body as any;
      if (!table || !data) return errorResponse('Missing "table" or "data"');
      if (filters.length === 0) return errorResponse('Updates require at least one filter');
      let query = supabase.from(table).update(data);
      for (const f of filters) {
        if (f.op === 'eq') query = query.eq(f.col, f.val);
        else if (f.op === 'in') query = query.in(f.col, f.val);
      }
      const { data: result, error } = await query.select();
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data: result });
    }

    // ==================== DELETE (SDK) ====================
    if (action === 'delete') {
      const { table, filters = [] } = body as any;
      if (!table) return errorResponse('Missing "table"');
      if (filters.length === 0) return errorResponse('Deletes require at least one filter');
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
      const { function_name, params = {} } = body as any;
      if (!function_name) return errorResponse('Missing "function_name"');
      const { data, error } = await supabase.rpc(function_name, params);
      if (error) return errorResponse(error.message, 500);
      return jsonResponse({ data });
    }

    // ==================== SQL (read-only, direct PG) ====================
    // Supports: { action: "sql", query: "SELECT * FROM t WHERE id = $1", params: ["uuid"] }
    // Or plain: { action: "sql", query: "SELECT * FROM t WHERE id = 'uuid'" }
    if (action === 'sql') {
      const { query, params } = body as { query?: string; params?: unknown[] };
      if (!query) return errorResponse('Missing "query"');
      console.log('[OpenClaw API] sql:', query, '| params:', JSON.stringify(params ?? []));
      try {
        const result = await execSQL(query, params);
        return jsonResponse({ data: result.rows, count: result.rowCount });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[OpenClaw API] sql error:', msg, '| query:', query, '| params:', JSON.stringify(params ?? []));
        return errorResponse(`SQL error: ${msg}`, 500);
      }
    }

    // ==================== SQL MUTATION (direct PG) ====================
    // Supports: { action: "sql_mutation", query: "DELETE FROM t WHERE id = $1", params: ["uuid"] }
    // Or plain: { action: "sql_mutation", query: "DELETE FROM t WHERE id = 'uuid'::uuid" }
    if (action === 'sql_mutation') {
      const { query, params } = body as { query?: string; params?: unknown[] };
      if (!query) return errorResponse('Missing "query"');
      console.log('[OpenClaw API] sql_mutation:', query, '| params:', JSON.stringify(params ?? []));
      try {
        const result = await execSQL(query, params);
        return jsonResponse({
          data: {
            affected_rows: result.command === 'SELECT' ? result.rows.length : result.rowCount,
            rows: result.rows,
            command: result.command,
            success: true,
          }
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[OpenClaw API] sql_mutation error:', msg, '| query:', query, '| params:', JSON.stringify(params ?? []));
        return errorResponse(`SQL error: ${msg}`, 500);
      }
    }

    // ==================== LIST TABLES ====================
    if (action === 'list_tables') {
      try {
        const result = await execSQL(
          `SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as size
           FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
        );
        return jsonResponse({ data: result.rows });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(msg, 500);
      }
    }

    // ==================== DESCRIBE ====================
    if (action === 'describe') {
      const { table } = body as any;
      if (!table) return errorResponse('Missing "table"');
      try {
        const result = await execSQL(
          `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1
           ORDER BY ordinal_position`,
          [table]
        );
        return jsonResponse({ data: result.rows });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(msg, 500);
      }
    }

    // ==================== INVOKE EDGE FUNCTION ====================
    if (action === 'invoke') {
      const { function_name, payload = {} } = body as any;
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
        version: '2.0.0',
        actions: ['query', 'insert', 'update', 'delete', 'rpc', 'sql', 'sql_mutation', 'list_tables', 'describe', 'invoke', 'health'],
        notes: 'sql/sql_mutation now support parameterized queries via "params" array. Use $1, $2, etc. in query string.',
      });
    }

    return errorResponse(`Unknown action: "${action}". Use "health" to see available actions.`);

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[OpenClaw API] Unhandled:', message);
    return errorResponse(message, 500);
  }
});
