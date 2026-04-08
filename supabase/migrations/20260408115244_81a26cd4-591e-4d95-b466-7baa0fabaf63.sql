-- Schedule smart follow-up to run once daily at 13:00 UTC (10:00 AM GMT-3)
SELECT cron.schedule(
  'smart-followup-daily',
  '0 13 * * 1-6',  -- Mon-Sat at 13:00 UTC (10:00 Campo Grande)
  $$
  SELECT net.http_post(
    url:='https://uszefkkajldrakxfrgxl.supabase.co/functions/v1/smart-followup',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzemVma2thamxkcmFreGZyZ3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDY1MDUsImV4cCI6MjA4OTUyMjUwNX0.D1A-4jvdZAYtR6i1QPcBxvXjf8k0EKUBUHM2uv3G5ss"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);