import * as cheerio from "cheerio";
import { UnifiedExtractionResult } from "../supabase";
import { DetectedUrlInfo } from "../url-detector";

function createPosterSvgDataUri(title: string, subtitle: string): string {
  const safeTitle = title
    .replace(/[<>&"']/g, "")
    .slice(0, 34)
    .toUpperCase();
  const safeSub = subtitle
    .replace(/[<>&"']/g, "")
    .slice(0, 42)
    .toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
    <rect width="800" height="500" fill="#080808"/>
    <rect x="24" y="24" width="752" height="452" fill="none" stroke="#c4956a" stroke-opacity="0.35" stroke-width="1.5"/>
    <circle cx="400" cy="215" r="46" fill="#121212" stroke="#c4956a" stroke-width="2"/>
    <polygon points="390,195 390,235 422,215" fill="#c4956a"/>
    <text x="400" y="315" text-anchor="middle" fill="#f0ece6" font-family="monospace" font-size="22" font-weight="bold" letter-spacing="2">${safeTitle}</text>
    <text x="400" y="350" text-anchor="middle" fill="#c4956a" font-family="monospace" font-size="13" letter-spacing="3">${safeSub}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createAvatarDataUri(username: string): string {
  const initials =
    username
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 2)
      .toUpperCase() || "TT";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <rect width="120" height="120" rx="60" fill="#141414"/>
    <circle cx="60" cy="60" r="56" fill="none" stroke="#c4956a" stroke-width="2"/>
    <text x="60" y="68" text-anchor="middle" fill="#f0ece6" font-family="monospace" font-size="28" font-weight="bold">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Metode Utama: Direct JSON API (TikWM hd=1 + Clipto HD Stream Resolver - PRD Bagian 3.2.2)
 */
async function scrapeTikTokViaTikwm(
  targetUrl: string,
  shortcode: string
): Promise<UnifiedExtractionResult | null> {
  try {
    const startMs = Date.now();
    const apiEndpoint = `https://www.tikwm.com/api/?url=${encodeURIComponent(
      targetUrl
    )}&hd=1`;

    // Jalankan resolusi Clipto HD secara paralel untuk mendapatkan stream 720p/1080p tertinggi
    const cliptoPromise = (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6500);
        const cRes = await fetch("https://www.clipto.com/api/youtube", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
          },
          body: JSON.stringify({ url: targetUrl }),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!cRes.ok) return null;
        return await cRes.json();
      } catch {
        return null;
      }
    })();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, 1250));
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(apiEndpoint, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) continue;
      json = await res.json();
      if (json?.code === 0 && json?.data) {
        break;
      }
    }

    const cliptoData = await cliptoPromise;
    const cliptoMedias: Array<{
      quality?: string;
      type?: string;
      width?: number;
      height?: number;
      url?: string;
    }> = Array.isArray(cliptoData?.medias) ? cliptoData.medias : [];

    const cliptoHdVideo = cliptoMedias.find(
      (m) => m.quality === "hd_no_watermark" && m.url
    )?.url;
    const cliptoSdVideo = cliptoMedias.find(
      (m) => m.quality === "no_watermark" && m.url
    )?.url;
    const cliptoAudio = cliptoMedias.find(
      (m) => m.type === "audio" && m.url
    )?.url;

    if (json?.code !== 0 || !json?.data) {
      if (cliptoHdVideo || cliptoSdVideo) {
        const bestVid = cliptoHdVideo || cliptoSdVideo || null;
        return {
          status: true,
          platform: "tiktok",
          contentType: "video",
          author: {
            username: cliptoData?.author || "tiktok_creator",
            avatar: createAvatarDataUri(cliptoData?.author || "TT"),
          },
          comment: null,
          media: {
            title: (cliptoData?.title || `TikTok HD #${shortcode}`).slice(0, 150),
            thumbnail:
              cliptoData?.thumbnail ||
              createPosterSvgDataUri("TIKTOK 1080P HD", `#${shortcode}`),
            videoHdUrl: bestVid,
            videoSdUrl: cliptoSdVideo || bestVid,
            audioMp3Url: cliptoAudio || bestVid,
            carouselItems: [],
          },
          meta: {
            urlHash: `tiktok:${shortcode}:media`,
            shortcode,
            cached: false,
            latencyMs: Date.now() - startMs,
            provider: "clipto_tiktok_hd",
            isSimulatedFallback: false,
          },
        };
      }
      return null;
    }

    const d = json.data;
    const realId = String(d.id || shortcode);
    const username = d.author?.unique_id || d.author?.nickname || "tiktok_creator";
    const avatar = d.author?.avatar || createAvatarDataUri(username);
    const title = d.title || `TikTok Media #${realId}`;
    const thumbnail =
      d.origin_cover ||
      d.cover ||
      createPosterSvgDataUri("TIKTOK NO-WM", `@${username}`);

    const imagesArray: string[] = Array.isArray(d.images) ? d.images : [];
    const isPhotoSlide = imagesArray.length > 0;

    // Utamakan stream HD CDN langsung (tikwm hdplay atau clipto hd_no_watermark)
    const videoHdUrl =
      d.hdplay ||
      cliptoHdVideo ||
      d.play ||
      (d.id ? `https://www.tikwm.com/video/media/hdplay/${d.id}.mp4` : null);
    const videoSdUrl =
      d.play ||
      cliptoSdVideo ||
      d.wmplay ||
      (d.id ? `https://www.tikwm.com/video/media/play/${d.id}.mp4` : videoHdUrl);
    const audioMp3Url =
      d.music || d.music_info?.play || cliptoAudio || videoHdUrl;

    const carouselItems = isPhotoSlide
      ? imagesArray.map((imgUrl: string) => ({
          type: "image" as const,
          url: imgUrl,
          previewUrl: imgUrl,
          resolution: "1080x1920",
        }))
      : [];

    return {
      status: true,
      platform: "tiktok",
      contentType: isPhotoSlide ? "photo_carousel" : "video",
      author: {
        username,
        avatar,
      },
      comment: null,
      media: {
        title: title.slice(0, 150),
        thumbnail,
        videoHdUrl: isPhotoSlide ? null : videoHdUrl,
        videoSdUrl: isPhotoSlide ? null : videoSdUrl,
        audioMp3Url,
        carouselItems,
      },
      meta: {
        urlHash: `tiktok:${realId}:media`,
        shortcode: realId,
        cached: false,
        latencyMs: Date.now() - startMs,
        provider: "tikwm_json_api_hd",
        isSimulatedFallback: false,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Metode Cadangan: HTML / Token Scraper (SSSTik / SnapTik dengan Regex + Cheerio - PRD Bagian 3.2.2)
 */
async function scrapeTikTokViaHtmlFallback(
  targetUrl: string,
  shortcode: string
): Promise<UnifiedExtractionResult | null> {
  try {
    const startMs = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    // Ambil halaman utama untuk mengekstrak token tt tersembunyi via Regex
    const pageRes = await fetch("https://ssstik.io/en", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      },
      signal: controller.signal,
    });

    if (!pageRes.ok) {
      clearTimeout(timeout);
      return null;
    }

    const pageHtml = await pageRes.text();
    const tokenMatch =
      pageHtml.match(/s_tt\s*=\s*['"]([^'"]+)['"]/i) ||
      pageHtml.match(/name="tt"\s+value="([^"]+)"/i);
    const token = tokenMatch ? tokenMatch[1] : "ssstik_token";

    const form = new URLSearchParams();
    form.set("id", targetUrl);
    form.set("locale", "en");
    form.set("tt", token);

    const postRes = await fetch("https://ssstik.io/abc?url=dl", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      },
      body: form.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!postRes.ok) return null;
    const html = await postRes.text();
    const $ = cheerio.load(html);

    const author = $("h2").first().text().trim() || "tiktok_creator";
    const title = $("p.maintext").first().text().trim() || `TikTok #${shortcode}`;
    let videoHdUrl: string | null = null;
    let audioMp3Url: string | null = null;
    const slides: Array<{
      type: "image" | "video";
      url: string;
      previewUrl?: string;
      resolution: string;
    }> = [];

    $("a.download_link, a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().toLowerCase();
      if (!href.startsWith("http")) return;

      if (text.includes("mp3") || $(el).hasClass("music")) {
        audioMp3Url = href;
      } else if (
        text.includes("without watermark") ||
        $(el).hasClass("without_watermark")
      ) {
        if (!videoHdUrl) videoHdUrl = href;
      }
    });

    $("img.result_overlay_buttons, .splide__slide img").each((_, el) => {
      const src = $(el).attr("src") || $(el).attr("data-splide-lazy") || "";
      if (src.startsWith("http")) {
        slides.push({
          type: "image",
          url: src,
          previewUrl: src,
          resolution: "1080x1920",
        });
      }
    });

    if (!videoHdUrl && slides.length === 0) return null;

    return {
      status: true,
      platform: "tiktok",
      contentType: slides.length > 0 ? "photo_carousel" : "video",
      author: {
        username: author,
        avatar: createAvatarDataUri(author),
      },
      comment: null,
      media: {
        title,
        thumbnail: createPosterSvgDataUri("TIKTOK NO-WM", `@${author}`),
        videoHdUrl,
        videoSdUrl: videoHdUrl,
        audioMp3Url,
        carouselItems: slides,
      },
      meta: {
        urlHash: `tiktok:${shortcode}:media`,
        shortcode,
        cached: false,
        latencyMs: Date.now() - startMs,
        provider: "ssstik_cheerio_fallback",
        isSimulatedFallback: false,
      },
    };
  } catch {
    return null;
  }
}

export async function scrapeTikTok(
  detected: DetectedUrlInfo,
  allowSimulationFallback = true
): Promise<UnifiedExtractionResult> {
  const startMs = Date.now();
  const shortcode = detected.shortcodeOrId || "7389120491827365120";

  // 1. Coba Metode Utama: Direct JSON API (TikWM)
  const primaryResult = await scrapeTikTokViaTikwm(
    detected.normalizedUrl,
    shortcode
  );
  if (primaryResult) {
    return primaryResult;
  }

  // 2. Coba Metode Cadangan: HTML / Token Scraper dengan Cheerio
  const secondaryResult = await scrapeTikTokViaHtmlFallback(
    detected.normalizedUrl,
    shortcode
  );
  if (secondaryResult) {
    return secondaryResult;
  }

  if (!allowSimulationFallback) {
    throw new Error(
      "Seluruh upstream TikTok sedang sibuk. Aktifkan mode Auto pada panel Admin."
    );
  }

  // 3. Fallback Terstruktur (Offline/Sandbox Safe)
  const isPhotoMode = detected.subtype === "tiktok_photo";
  const authorHandle = isPhotoMode ? "kreatif_studio" : "teknologi_id";

  const carouselItems = isPhotoMode
    ? [
        {
          type: "image" as const,
          url: `/api/proxy-download?demo=1&format=jpg&platform=tiktok&id=${shortcode}_slide_1`,
          previewUrl: createPosterSvgDataUri(
            `TIKTOK SLIDE 01`,
            "1080x1920 PHOTO MODE"
          ),
          resolution: "1080x1920",
        },
        {
          type: "image" as const,
          url: `/api/proxy-download?demo=1&format=jpg&platform=tiktok&id=${shortcode}_slide_2`,
          previewUrl: createPosterSvgDataUri(
            `TIKTOK SLIDE 02`,
            "1080x1920 PHOTO MODE"
          ),
          resolution: "1080x1920",
        },
        {
          type: "image" as const,
          url: `/api/proxy-download?demo=1&format=jpg&platform=tiktok&id=${shortcode}_slide_3`,
          previewUrl: createPosterSvgDataUri(
            `TIKTOK SLIDE 03`,
            "1080x1920 PHOTO MODE"
          ),
          resolution: "1080x1920",
        },
      ]
    : [];

  return {
    status: true,
    platform: "tiktok",
    contentType: isPhotoMode ? "photo_carousel" : "video",
    author: {
      username: authorHandle,
      avatar: createAvatarDataUri(authorHandle),
    },
    comment: null,
    media: {
      title: isPhotoMode
        ? `TikTok Photo Mode Slide & Original Audio #${shortcode}`
        : `TikTok Video 1080p Tanpa Watermark #${shortcode}`,
      thumbnail: createPosterSvgDataUri(
        `TIKTOK • ${shortcode.slice(0, 10)}`,
        isPhotoMode ? "PHOTO MODE SLIDESHOW" : "1080P CLEAN NO WATERMARK"
      ),
      videoHdUrl: isPhotoMode
        ? null
        : `/api/proxy-download?demo=1&format=mp4&quality=1080p&platform=tiktok&id=${shortcode}`,
      videoSdUrl: isPhotoMode
        ? null
        : `/api/proxy-download?demo=1&format=mp4&quality=720p&platform=tiktok&id=${shortcode}`,
      audioMp3Url: `/api/proxy-download?demo=1&format=mp3&platform=tiktok&id=${shortcode}`,
      carouselItems,
    },
    meta: {
      urlHash: `tiktok:${shortcode}:media`,
      shortcode,
      cached: false,
      latencyMs: Date.now() - startMs,
      provider: "tiktok_serverless_engine",
      isSimulatedFallback: true,
    },
  };
}

