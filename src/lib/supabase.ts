import { createClient, SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

export const ADMIN_SESSION_TOKEN = "dapzsyz_admin_session_2026";

export type PlatformName = "instagram" | "tiktok" | "youtube";
export type UnifiedContentType = "comment" | "video" | "photo_carousel";

/**
 * Standarisasi Output API (Unified JSON Schema - PRD Bagian 3.3)
 */
export interface UnifiedExtractionResult {
  status: boolean;
  platform: PlatformName;
  contentType: UnifiedContentType;
  author: {
    username: string;
    avatar: string;
  };
  comment: {
    id: string;
    text: string;
    username?: string;
    avatar?: string;
    sourceLabel?: string;
  } | null;
  media: {
    title: string;
    thumbnail: string;
    videoHdUrl: string | null;
    videoSdUrl?: string | null;
    audioMp3Url: string | null;
    carouselItems: Array<{
      type: "image" | "video";
      url: string;
      previewUrl?: string;
      resolution: string;
    }>;
  };
  meta?: {
    urlHash: string;
    shortcode: string;
    cached: boolean;
    latencyMs: number;
    provider: string;
    isSimulatedFallback?: boolean;
  };
}

export interface ScraperSessionRow {
  id: string;
  platform: PlatformName;
  account_label: string;
  session_cookie: string;
  session_cookie_masked: string;
  user_agent: string;
  is_active: boolean;
  fail_count: number;
  use_count: number;
  last_used_at: string;
}

export interface ExtractionCacheRow {
  url_hash: string;
  platform: PlatformName;
  response_data: UnifiedExtractionResult;
  expires_at: string;
  created_at: string;
  hit_count: number;
}

export interface UsageLogRow {
  id: string;
  ip_hash: string;
  url_hash: string;
  platform: string;
  content_type: string;
  cache_hit: boolean;
  latency_ms: number;
  provider_used: string;
  status: "ok" | "error";
  note?: string;
  created_at: string;
}

export interface ServerAdminConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  engineMode: "auto" | "live_only" | "simulation_fallback";
  cacheTtlMinutes: number;
  rateLimitPerMinute: number;
  enabledPlatforms: {
    instagram: boolean;
    tiktok: boolean;
    youtube: boolean;
  };
  lastRestartedAt: string;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

let supabaseAdminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_KEY ||
    SUPABASE_URL.includes("your-project-id.supabase.co")
  ) {
    return null;
  }
  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return supabaseAdminClient;
}

export function hashVisitorIp(rawIp: string): string {
  return crypto
    .createHash("sha256")
    .update(`dafian_salt_${rawIp}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Kunci unik hasil normalisasi: platform + shortcode + comment_id (PRD Bagian 4.2)
 */
export function buildNormalizedUrlHash(params: {
  platform: PlatformName;
  shortcode: string;
  commentId?: string | null;
}): string {
  const base = `${params.platform}:${params.shortcode}:${
    params.commentId || "media"
  }`;
  return base.replace(/[^a-zA-Z0-9:_-]/g, "");
}

function maskCookieString(cookie: string): string {
  const clean = cookie.trim();
  if (clean.length <= 20) return clean;
  return `${clean.slice(0, 16)}...${clean.slice(-6)}`;
}

// In-Memory State (Fallback & Mirror untuk Supabase PostgreSQL)
const serverConfigStore: ServerAdminConfig = {
  maintenanceMode: false,
  maintenanceMessage:
    "Layanan sedang dalam pemeliharaan singkat. Silakan coba beberapa saat lagi.",
  engineMode: "auto",
  cacheTtlMinutes: 90, // 1-2 jam mengikuti masa aktif URL CDN (PRD Bagian 4.2)
  rateLimitPerMinute: 30,
  enabledPlatforms: {
    instagram: true,
    tiktok: true,
    youtube: true,
  },
  lastRestartedAt: new Date().toISOString(),
};

const scraperSessionsStore: ScraperSessionRow[] = [
  {
    id: "sess-ig-01",
    platform: "instagram",
    account_label: "ig_worker_01",
    session_cookie:
      process.env.IG_SESSION_COOKIE_1 ||
      "sessionid=68192041%3A9KmP...%3A14; csrftoken=x8KpL92mN0vQ; ds_user_id=68192041",
    session_cookie_masked: "sessionid=68192041...2041",
    user_agent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 324.0.0.19.90",
    is_active: true,
    fail_count: 0,
    use_count: 14,
    last_used_at: new Date(Date.now() - 180000).toISOString(),
  },
  {
    id: "sess-ig-02",
    platform: "instagram",
    account_label: "ig_worker_02",
    session_cookie:
      process.env.IG_SESSION_COOKIE_2 ||
      "sessionid=68192042%3A4RtW...%3A09; csrftoken=p3LmN81zV4cX; ds_user_id=68192042",
    session_cookie_masked: "sessionid=68192042...2042",
    user_agent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    is_active: true,
    fail_count: 0,
    use_count: 11,
    last_used_at: new Date(Date.now() - 240000).toISOString(),
  },
  {
    id: "sess-ig-03",
    platform: "instagram",
    account_label: "ig_worker_03",
    session_cookie:
      "sessionid=68192043%3A7BnM...%3A22; csrftoken=k9QwE23rT6yU; ds_user_id=68192043",
    session_cookie_masked: "sessionid=68192043...2043",
    user_agent:
      "Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    is_active: true,
    fail_count: 1,
    use_count: 9,
    last_used_at: new Date(Date.now() - 360000).toISOString(),
  },
];

const extractionCacheStore = new Map<string, ExtractionCacheRow>();
const usageLogsStore: UsageLogRow[] = [];

/**
 * Rate Limiting per IP Hash berdasarkan tabel usage_logs (PRD Bagian 4.3)
 */
export function checkRateLimit(ipHash: string): {
  allowed: boolean;
  requestsLastMinute: number;
} {
  const oneMinAgo = Date.now() - 60 * 1000;
  const recent = usageLogsStore.filter(
    (l) =>
      l.ip_hash === ipHash && new Date(l.created_at).getTime() >= oneMinAgo
  );
  return {
    allowed: recent.length < serverConfigStore.rateLimitPerMinute,
    requestsLastMinute: recent.length,
  };
}

/**
 * Mengambil 1 Session Cookie aktif secara Round-Robin (PRD Bagian 3.2.1 & 4.1)
 */
export async function acquireRoundRobinSession(
  platform: PlatformName = "instagram"
): Promise<ScraperSessionRow | null> {
  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      const { data } = await sb
        .from("scraper_sessions")
        .select("*")
        .eq("platform", platform)
        .eq("is_active", true)
        .order("last_used_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (data) {
        await sb
          .from("scraper_sessions")
          .update({
            last_used_at: new Date().toISOString(),
            use_count: (data.use_count || 0) + 1,
          })
          .eq("id", data.id);

        return {
          ...data,
          account_label: data.account_label || "ig_worker",
          session_cookie_masked: maskCookieString(data.session_cookie),
        };
      }
    } catch {
      // Fallback ke store lokal
    }
  }

  const activeList = scraperSessionsStore.filter(
    (s) =>
      s.platform === platform &&
      s.is_active &&
      !s.session_cookie.includes("...")
  );
  if (activeList.length === 0) return null;

  activeList.sort(
    (a, b) =>
      new Date(a.last_used_at).getTime() - new Date(b.last_used_at).getTime()
  );

  const chosen = activeList[0];
  chosen.use_count += 1;
  chosen.last_used_at = new Date().toISOString();
  return chosen;
}

/**
 * Melaporkan kegagalan sesi; otomatis menonaktifkan jika fail_count >= 3 (PRD Bagian 4.1)
 */
export async function reportSessionFailure(sessionId: string): Promise<void> {
  const local = scraperSessionsStore.find((s) => s.id === sessionId);
  if (local) {
    local.fail_count += 1;
    if (local.fail_count >= 3) {
      local.is_active = false;
    }
  }

  const sb = getSupabaseAdmin();
  if (sb && local) {
    try {
      await sb
        .from("scraper_sessions")
        .update({
          fail_count: local.fail_count,
          is_active: local.is_active,
        })
        .eq("id", sessionId);
    } catch {
      // Abaikan
    }
  }
}

export async function resetSessionSuccess(sessionId: string): Promise<void> {
  const local = scraperSessionsStore.find((s) => s.id === sessionId);
  if (local && local.fail_count > 0) {
    local.fail_count = 0;
  }
}

/**
 * Membaca cache ekstraksi dari Supabase (< 100ms response - PRD Bagian 4.2)
 */
export async function getCachedExtraction(
  urlHash: string
): Promise<UnifiedExtractionResult | null> {
  const now = Date.now();
  const sb = getSupabaseAdmin();

  if (sb) {
    try {
      const { data } = await sb
        .from("extraction_cache")
        .select("*")
        .eq("url_hash", urlHash)
        .maybeSingle();

      if (data && new Date(data.expires_at).getTime() > now) {
        return data.response_data as UnifiedExtractionResult;
      }
    } catch {
      // Lanjut ke memori lokal
    }
  }

  const local = extractionCacheStore.get(urlHash);
  if (!local) return null;
  if (new Date(local.expires_at).getTime() <= now) {
    extractionCacheStore.delete(urlHash);
    return null;
  }

  local.hit_count += 1;
  return local.response_data;
}

/**
 * Menyimpan hasil ekstraksi ke tabel extraction_cache (TTL 1-2 jam)
 */
export async function saveExtractionToCache(
  urlHash: string,
  platform: PlatformName,
  responseData: UnifiedExtractionResult
): Promise<void> {
  const now = new Date();
  const ttlMs = (serverConfigStore.cacheTtlMinutes || 90) * 60 * 1000;
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();

  extractionCacheStore.set(urlHash, {
    url_hash: urlHash,
    platform,
    response_data: responseData,
    created_at: now.toISOString(),
    expires_at: expiresAt,
    hit_count: 1,
  });

  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      await sb.from("extraction_cache").upsert({
        url_hash: urlHash,
        platform,
        response_data: responseData,
        expires_at: expiresAt,
        created_at: now.toISOString(),
      });
    } catch {
      // Abaikan jika Supabase belum terhubung
    }
  }
}

/**
 * Mencatat log aktivitas & rate limit ke tabel usage_logs (PRD Bagian 4.3)
 */
export async function logScraperUsage(params: {
  ipHash: string;
  urlHash: string;
  platform: string;
  contentType: string;
  cacheHit: boolean;
  latencyMs: number;
  providerUsed: string;
  status?: "ok" | "error";
  note?: string;
}): Promise<void> {
  const row: UsageLogRow = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ip_hash: params.ipHash,
    url_hash: params.urlHash,
    platform: params.platform,
    content_type: params.contentType,
    cache_hit: params.cacheHit,
    latency_ms: params.latencyMs,
    provider_used: params.providerUsed,
    status: params.status || "ok",
    note: params.note,
    created_at: new Date().toISOString(),
  };

  usageLogsStore.unshift(row);
  if (usageLogsStore.length > 50) {
    usageLogsStore.pop();
  }

  const sb = getSupabaseAdmin();
  if (sb) {
    try {
      await sb.from("usage_logs").insert({
        ip_hash: row.ip_hash,
        url_hash: row.url_hash,
        platform: row.platform,
        content_type: row.content_type,
        cache_hit: row.cache_hit,
        latency_ms: row.latency_ms,
        provider_used: row.provider_used,
        status: row.status,
      });
    } catch {
      // Abaikan
    }
  }
}

// Fungsi Manajemen Admin Server
export function getServerAdminConfig(): ServerAdminConfig {
  return {
    ...serverConfigStore,
    enabledPlatforms: { ...serverConfigStore.enabledPlatforms },
  };
}

export function updateServerAdminConfig(
  patch: Partial<ServerAdminConfig>
): ServerAdminConfig {
  if (typeof patch.maintenanceMode === "boolean") {
    serverConfigStore.maintenanceMode = patch.maintenanceMode;
  }
  if (typeof patch.maintenanceMessage === "string") {
    serverConfigStore.maintenanceMessage = patch.maintenanceMessage;
  }
  if (patch.engineMode) {
    serverConfigStore.engineMode = patch.engineMode;
  }
  if (typeof patch.cacheTtlMinutes === "number" && patch.cacheTtlMinutes >= 1) {
    serverConfigStore.cacheTtlMinutes = patch.cacheTtlMinutes;
  }
  if (
    typeof patch.rateLimitPerMinute === "number" &&
    patch.rateLimitPerMinute >= 5
  ) {
    serverConfigStore.rateLimitPerMinute = patch.rateLimitPerMinute;
  }
  if (patch.enabledPlatforms) {
    serverConfigStore.enabledPlatforms = {
      ...serverConfigStore.enabledPlatforms,
      ...patch.enabledPlatforms,
    };
  }
  return getServerAdminConfig();
}

export function restartWorkerState(): ServerAdminConfig {
  extractionCacheStore.clear();
  for (const sess of scraperSessionsStore) {
    sess.fail_count = 0;
  }
  serverConfigStore.lastRestartedAt = new Date().toISOString();
  return getServerAdminConfig();
}

export function toggleScraperSessionStatus(id: string): ScraperSessionRow[] {
  const target = scraperSessionsStore.find((s) => s.id === id);
  if (target) {
    target.is_active = !target.is_active;
    if (target.is_active) {
      target.fail_count = 0;
    }
  }
  return [...scraperSessionsStore];
}

export function addScraperSession(params: {
  platform: PlatformName;
  account_label: string;
  session_cookie: string;
}): ScraperSessionRow[] {
  const cleanCookie = params.session_cookie.trim();
  const newSess: ScraperSessionRow = {
    id: `sess-${params.platform.slice(0, 2)}-${Date.now().toString().slice(-4)}`,
    platform: params.platform,
    account_label: params.account_label.trim() || `${params.platform}_worker`,
    session_cookie: cleanCookie,
    session_cookie_masked: maskCookieString(cleanCookie),
    user_agent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 324.0",
    is_active: true,
    fail_count: 0,
    use_count: 0,
    last_used_at: new Date().toISOString(),
  };

  scraperSessionsStore.unshift(newSess);
  return [...scraperSessionsStore];
}

export function deleteScraperSession(id: string): ScraperSessionRow[] {
  const idx = scraperSessionsStore.findIndex((s) => s.id === id);
  if (idx !== -1) {
    scraperSessionsStore.splice(idx, 1);
  }
  return [...scraperSessionsStore];
}

export function clearSupabaseExtractionCache(): number {
  const count = extractionCacheStore.size;
  extractionCacheStore.clear();
  return count;
}

export function clearUsageLogs(): number {
  const count = usageLogsStore.length;
  usageLogsStore.length = 0;
  return count;
}

export function getSupabaseTelemetrySnapshot() {
  const activeCacheEntries = Array.from(extractionCacheStore.values()).map(
    (c) => ({
      url_hash: c.url_hash,
      platform: c.platform,
      subtype: c.response_data.contentType,
      normalized_url: c.response_data.media.title,
      hit_count: c.hit_count,
      expires_at: c.expires_at,
    })
  );

  return {
    connectedMode: getSupabaseAdmin()
      ? "SUPABASE_CLOUD_RLS"
      : "VERCEL_SERVERLESS_MEMORY",
    serverConfig: getServerAdminConfig(),
    tables: {
      scraper_sessions: scraperSessionsStore.map((s) => ({
        id: s.id,
        platform: s.platform,
        account_label: s.account_label,
        session_cookie_masked: s.session_cookie_masked,
        is_active: s.is_active,
        fail_count: s.fail_count,
        use_count: s.use_count,
        last_used_at: s.last_used_at,
      })),
      extraction_cache: activeCacheEntries,
      usage_logs: usageLogsStore.slice(0, 25),
    },
  };
}

