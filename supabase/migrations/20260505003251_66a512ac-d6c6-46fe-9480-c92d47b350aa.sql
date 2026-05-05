ALTER TABLE public.nina_settings
  ADD COLUMN IF NOT EXISTS grouping_delay_first_ms integer NOT NULL DEFAULT 2000,
  ADD COLUMN IF NOT EXISTS grouping_delay_active_ms integer NOT NULL DEFAULT 8000,
  ADD COLUMN IF NOT EXISTS grouping_delay_after_ai_ms integer NOT NULL DEFAULT 10000;