import {
  PlatformName,
  UnifiedExtractionResult,
  buildNormalizedUrlHash,
  getCachedExtraction,
  getServerAdminConfig,
  logScraperUsage,
  saveExtractionToCache,
} from "../supabase";
import { detectSocialUrl } from "../url-detector";
import { scrapeInstagram } from "./instagram";
import { scrapeTikTok } from "./tiktok";
import { scrapeYouTube } from "./youtube";

const PLATFORM_NAMES: Record<PlatformName, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

export async function extractSocialMedia(
  rawUrl: string,
  ipHash: string,
  expectedPlatform?: PlatformName
): Promise<UnifiedExtractionResult> {
  const startMs = Date.now();
  const config = getServerAdminConfig();

  if (config.maintenanceMode) {
    throw new Error(config.maintenanceMessage);
  }

  const detected = detectSocialUrl(rawUrl);
  if (!detected.isValid || detected.platform === "unknown") {
    const targetName = expectedPlatform
      ? PLATFORM_NAMES[expectedPlatform]
      : "Instagram, TikTok, atau YouTube";
    throw new Error(
      `Format link tidak valid. Pastikan Anda menempelkan link ${targetName} yang benar.`
    );
  }

  const platform = detected.platform as PlatformName;

  // Validasi ketat: pastikan link sesuai dengan aplikasi sosial media yang sedang dipilih
  if (expectedPlatform && platform !== expectedPlatform) {
    const expectedName = PLATFORM_NAMES[expectedPlatform];
    const detectedName = PLATFORM_NAMES[platform];
    throw new Error(
      `Link tidak sesuai! Anda sedang di menu ${expectedName}, tetapi menempelkan link ${detectedName}. Gunakan link khusus ${expectedName}.`
    );
  }

  if (!config.enabledPlatforms[platform]) {
    throw new Error(
      `Layanan ekstraksi untuk ${PLATFORM_NAMES[platform]} sedang dinonaktifkan sementara oleh Administrator.`
    );
  }

  const shortcode = detected.shortcodeOrId || "media";
  const urlHash = buildNormalizedUrlHash({
    platform,
    shortcode,
    commentId: detected.commentId,
  });

  // 1. Cek Extraction Cache di Supabase (< 100ms response - PRD Bagian 4.2)
  const cachedResult = await getCachedExtraction(urlHash);
  if (cachedResult && !cachedResult.meta?.isSimulatedFallback) {
    const latencyMs = Date.now() - startMs;
    await logScraperUsage({
      ipHash,
      urlHash,
      platform,
      contentType: cachedResult.contentType,
      cacheHit: true,
      latencyMs,
      providerUsed: "supabase_extraction_cache",
      status: "ok",
    });

    return {
      ...cachedResult,
      meta: {
        urlHash,
        shortcode,
        cached: true,
        latencyMs,
        provider: cachedResult.meta?.provider || "supabase_cache",
        isSimulatedFallback: cachedResult.meta?.isSimulatedFallback,
      },
    };
  }

  // 2. Jalankan Custom Scraper Engine sesuai platform
  const allowSimulationFallback = config.engineMode !== "live_only";
  let result: UnifiedExtractionResult;

  if (platform === "instagram") {
    result = await scrapeInstagram(detected, allowSimulationFallback);
  } else if (platform === "tiktok") {
    result = await scrapeTikTok(detected, allowSimulationFallback);
  } else {
    result = await scrapeYouTube(detected, allowSimulationFallback);
  }

  const totalLatencyMs = Date.now() - startMs;
  const finalResult: UnifiedExtractionResult = {
    ...result,
    meta: {
      urlHash,
      shortcode,
      cached: false,
      latencyMs: totalLatencyMs,
      provider: result.meta?.provider || `${platform}_scraper`,
      isSimulatedFallback: result.meta?.isSimulatedFallback,
    },
  };

  // 3. Simpan ke tabel extraction_cache & catat di usage_logs
  await saveExtractionToCache(urlHash, platform, finalResult);
  await logScraperUsage({
    ipHash,
    urlHash,
    platform,
    contentType: finalResult.contentType,
    cacheHit: false,
    latencyMs: totalLatencyMs,
    providerUsed: finalResult.meta?.provider || `${platform}_scraper`,
    status: "ok",
  });

  return finalResult;
}
