-- Disable followup-engine cron job
SELECT cron.unschedule(3);

-- Disable run-automations cron job  
SELECT cron.unschedule(1);