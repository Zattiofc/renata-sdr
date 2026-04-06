
-- Add cron job to retry pending send_queue messages every minute
SELECT cron.schedule(
  'retry-pending-send-queue',
  '* * * * *',
  $$
  SELECT
    net.http_post(
        url:='https://uszefkkajldrakxfrgxl.supabase.co/functions/v1/trigger-whatsapp-sender',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzemVma2thamxkcmFreGZyZ3hsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NDY1MDUsImV4cCI6MjA4OTUyMjUwNX0.D1A-4jvdZAYtR6i1QPcBxvXjf8k0EKUBUHM2uv3G5ss"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);
