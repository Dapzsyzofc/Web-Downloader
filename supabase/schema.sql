-- ============================================================================
-- SUPABASE POSTGRESQL SCHEMA (update_sistem_prd.md Bagian 4)
-- 100% Vercel Serverless + Supabase (RLS Enabled)
-- ============================================================================

-- 4.1. Tabel scraper_sessions (Manajemen Cookie Instagram)
CREATE TABLE IF NOT EXISTS public.scraper_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL DEFAULT 'instagram' CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
    account_label TEXT NOT NULL DEFAULT 'ig_worker',
    session_cookie TEXT NOT NULL,
    user_agent TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    fail_count INTEGER NOT NULL DEFAULT 0,
    use_count BIGINT NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraper_sessions_round_robin
    ON public.scraper_sessions (platform, is_active, last_used_at ASC);

-- Trigger otomatis menonaktifkan sesi jika fail_count >= 3 (PRD Bagian 4.1)
CREATE OR REPLACE FUNCTION public.fn_auto_disable_failed_session()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.fail_count >= 3 THEN
        NEW.is_active := false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_disable_session ON public.scraper_sessions;
CREATE TRIGGER trg_auto_disable_session
    BEFORE UPDATE OF fail_count ON public.scraper_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_auto_disable_failed_session();

-- 4.2. Tabel extraction_cache (Cache Hasil Ekstraksi Cepat < 100ms)
CREATE TABLE IF NOT EXISTS public.extraction_cache (
    url_hash TEXT PRIMARY KEY,
    platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
    response_data JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '2 hours'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extraction_cache_expires
    ON public.extraction_cache (expires_at);

-- 4.3. Tabel usage_logs (Rate Limiting & Analitik)
CREATE TABLE IF NOT EXISTS public.usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_hash TEXT NOT NULL,
    url_hash TEXT NOT NULL,
    platform TEXT NOT NULL,
    content_type TEXT NOT NULL,
    cache_hit BOOLEAN NOT NULL DEFAULT false,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    provider_used TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ok',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_ip_rate
    ON public.usage_logs (ip_hash, created_at DESC);

-- Proteksi Row Level Security (RLS) sesuai PRD Bagian 5
ALTER TABLE public.scraper_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;
