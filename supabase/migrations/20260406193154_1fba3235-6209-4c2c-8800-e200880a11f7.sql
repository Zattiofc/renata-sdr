-- Function for read-only queries
CREATE OR REPLACE FUNCTION public.execute_readonly_query(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (UPPER(TRIM(sql_query)) LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed';
  END IF;
  
  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || sql_query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Function for mutations (INSERT/UPDATE/DELETE)
CREATE OR REPLACE FUNCTION public.execute_mutation_query(sql_query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected_rows integer;
  normalized text;
BEGIN
  normalized := UPPER(TRIM(sql_query));
  
  IF normalized LIKE 'DROP%' OR normalized LIKE 'TRUNCATE%' OR normalized LIKE 'ALTER%' THEN
    RAISE EXCEPTION 'DDL operations (DROP, ALTER, TRUNCATE) are not allowed';
  END IF;
  
  IF NOT (normalized LIKE 'INSERT%' OR normalized LIKE 'UPDATE%' OR normalized LIKE 'DELETE%') THEN
    RAISE EXCEPTION 'Only INSERT, UPDATE, DELETE are allowed';
  END IF;
  
  EXECUTE sql_query;
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  
  RETURN jsonb_build_object('affected_rows', affected_rows, 'success', true);
END;
$$;