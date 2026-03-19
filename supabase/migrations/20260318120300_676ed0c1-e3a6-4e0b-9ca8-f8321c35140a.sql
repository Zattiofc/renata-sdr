ALTER TABLE public.nina_settings 
ADD COLUMN IF NOT EXISTS ai_provider text NOT NULL DEFAULT 'google',
ADD COLUMN IF NOT EXISTS ai_api_key text NULL,
ADD COLUMN IF NOT EXISTS ai_model_name text NULL;