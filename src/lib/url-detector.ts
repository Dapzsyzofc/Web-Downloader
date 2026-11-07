export type PlatformType = "instagram" | "tiktok" | "youtube" | "unknown";

export type WorkspacePlatform = "instagram" | "tiktok" | "youtube";

export type UnifiedContentType = "comment" | "video" | "photo_carousel";

export interface UnifiedExtractionResult {
  status: boolean;
  platform: WorkspacePlatform;
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

export function toProxyDownloadUrl(params: {
  rawUrl: string | null | undefined;
  audioUrl?: string | null | undefined;
  platform: WorkspacePlatform;
  format: "mp4" | "mp3" | "jpg";
  quality?: string;
  id?: string;
  inline?: boolean;
}): string {
  const {
    rawUrl,
    audioUrl,
    platform,
    format,
    quality = "1080p",
    id = "media",
    inline = false,
  } = params;
  if (!rawUrl) {
    return `/api/proxy-download?demo=1&platform=${platform}&format=${format}&quality=${quality}&id=${id}`;
  }
  if (rawUrl.startsWith("/api/proxy-download") || rawUrl.startsWith("data:")) {
    return rawUrl;
  }
  const audioParam =
    audioUrl &&
    !audioUrl.startsWith("/api/proxy-download") &&
    audioUrl !== rawUrl
      ? `&audioUrl=${encodeURIComponent(audioUrl)}`
      : "";
  return `/api/proxy-download?url=${encodeURIComponent(
    rawUrl
  )}${audioParam}&platform=${platform}&format=${format}&quality=${quality}&id=${id}${
    inline ? "&inline=1" : ""
  }`;
}

export type ContentSubtype =
  | "ig_comment"
  | "ig_reel"
  | "ig_post"
  | "ig_tv"
  | "ig_share"
  | "tiktok_video"
  | "tiktok_photo"
  | "tiktok_shortlink"
  | "youtube_video"
  | "youtube_shorts"
  | "unknown";

export interface DetectedUrlInfo {
  isValid: boolean;
  normalizedUrl: string;
  platform: PlatformType;
  subtype: ContentSubtype;
  shortcodeOrId: string | null;
  igMediaIdNumeric: string | null;
  commentId: string | null;
  label: string;
  capabilities: string[];
}

export interface SamplePresetLink {
  id: string;
  platform: WorkspacePlatform;
  badge: string;
  label: string;
  url: string;
  description: string;
}

export const SAMPLE_TEST_LINKS: SamplePresetLink[] = [
  {
    id: "ig-comment",
    platform: "instagram",
    badge: "IG • ?comment_id=",
    label: "Salin Komentar IG + Unduh Reel HD",
    url: "https://www.instagram.com/reel/DfCWCWTuw-2/?comment_id=18107760188117477",
    description: "Mengekstrak teks komentar spesifik & video Reels 1080p + MP3",
  },
  {
    id: "ig-carousel",
    platform: "instagram",
    badge: "IG • REEL / POST",
    label: "Reels / Postingan Instagram HD",
    url: "https://www.instagram.com/reel/DfYwaRCguG4/",
    description: "Mengunduh video Reels / Postingan Instagram resolusi asli",
  },
  {
    id: "tiktok-nowm",
    platform: "tiktok",
    badge: "TIKTOK • NO WATERMARK",
    label: "Video TikTok 1080p Tanpa Watermark",
    url: "https://vt.tiktok.com/ZSprxN6Fb/",
    description: "Mengunduh source stream .mp4 bersih + original sound .mp3",
  },
  {
    id: "tiktok-photo",
    platform: "tiktok",
    badge: "TIKTOK • PHOTO MODE",
    label: "TikTok Slide Gambar + Musik Latar",
    url: "https://vt.tiktok.com/ZSp678wpQ/",
    description: "Mengunduh seluruh slide foto TikTok + musik latar .mp3",
  },
  {
    id: "youtube-hd",
    platform: "youtube",
    badge: "YOUTUBE • VIDEO + MP3",
    label: "Payung Teduh - Untuk Perempuan (MP4 + MP3)",
    url: "https://www.youtube.com/watch?v=y_CXsHlXcYE",
    description: "Video .mp4 muxed dengan suara + ekstrak audio .mp3 asli",
  },
  {
    id: "youtube-music",
    platform: "youtube",
    badge: "YOUTUBE • OFFICIAL MV",
    label: "Video Musik YouTube (MP4 + MP3)",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    description: "Mengunduh video YouTube .mp4 + jalur suara .mp3",
  },
];

const IG_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * Membedah shortcode Instagram menjadi media_id numerik
 */
export function shortcodeToMediaId(shortcode: string): string | null {
  try {
    const clean = shortcode.replace(/[^A-Za-z0-9\-_]/g, "").slice(0, 11);
    if (!clean) return null;
    let id = BigInt(0);
    for (let i = 0; i < clean.length; i++) {
      const charIndex = IG_ALPHABET.indexOf(clean[i]);
      if (charIndex === -1) return null;
      id = id * BigInt(64) + BigInt(charIndex);
    }
    return id.toString(10);
  } catch {
    return null;
  }
}

export function extractUrlFromText(rawInput: string): string {
  const trimmed = rawInput.trim();
  const urlMatch = trimmed.match(/https?:\/\/[^\s"'<>]+/i);
  if (urlMatch) {
    return urlMatch[0];
  }
  if (
    /^(www\.|instagram\.com|instagr\.am|tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com|youtube\.com|youtu\.be)/i.test(
      trimmed
    )
  ) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function detectSocialUrl(rawInput: string): DetectedUrlInfo {
  const candidate = extractUrlFromText(rawInput);

  if (!candidate) {
    return {
      isValid: false,
      normalizedUrl: "",
      platform: "unknown",
      subtype: "unknown",
      shortcodeOrId: null,
      igMediaIdNumeric: null,
      commentId: null,
      label: "Menunggu Tautan",
      capabilities: [],
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      isValid: false,
      normalizedUrl: candidate,
      platform: "unknown",
      subtype: "unknown",
      shortcodeOrId: null,
      igMediaIdNumeric: null,
      commentId: null,
      label: "Format URL Tidak Valid",
      capabilities: [],
    };
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const path = parsed.pathname;

  // 1. INSTAGRAM DETECTION (Mendukung /p/, /reel/, /reels/, /tv/, /c/{comment_id}, ?comment_id=, dan /share/)
  if (
    host === "instagram.com" ||
    host === "instagr.am" ||
    host.endsWith(".instagram.com")
  ) {
    // Cek comment_id dari query param maupun path /c/{comment_id}
    const pathCommentMatch = path.match(/\/c\/(\d+)/i);
    const commentId =
      parsed.searchParams.get("comment_id") ||
      parsed.searchParams.get("target_comment_id") ||
      (pathCommentMatch ? pathCommentMatch[1] : null);

    // Cek format /share/p/{code}, /share/reel/{code}, atau /share/{code}
    const shareMatch = path.match(
      /\/share\/(?:(p|reel|reels|tv)\/)?([A-Za-z0-9\-_]+)/i
    );
    if (shareMatch) {
      const shareCode = shareMatch[2];
      return {
        isValid: true,
        normalizedUrl: parsed.toString(),
        platform: "instagram",
        subtype: commentId ? "ig_comment" : "ig_share",
        shortcodeOrId: shareCode,
        igMediaIdNumeric: null,
        commentId,
        label: "Instagram • Share Link",
        capabilities: [
          "Salin Teks Komentar / Caption",
          "Download Video/Reels HD",
          "Ekstrak Audio MP3",
        ],
      };
    }

    const igMatch = path.match(/\/(p|reel|reels|tv)\/([A-Za-z0-9\-_]+)/i);
    const shortcode = igMatch ? igMatch[2] : null;
    const mediaType = igMatch ? igMatch[1].toLowerCase() : "p";
    const igMediaIdNumeric = shortcode ? shortcodeToMediaId(shortcode) : null;

    if (commentId && shortcode) {
      return {
        isValid: true,
        normalizedUrl: parsed.toString(),
        platform: "instagram",
        subtype: "ig_comment",
        shortcodeOrId: shortcode,
        igMediaIdNumeric,
        commentId,
        label: "Instagram • Komentar + Media",
        capabilities: [
          "Salin Teks Komentar",
          "Download Video/Reels HD",
          "Ekstrak Audio MP3",
        ],
      };
    }

    if (shortcode) {
      const subtype: ContentSubtype =
        mediaType === "reel" || mediaType === "reels"
          ? "ig_reel"
          : mediaType === "tv"
          ? "ig_tv"
          : "ig_post";

      return {
        isValid: true,
        normalizedUrl: parsed.toString(),
        platform: "instagram",
        subtype,
        shortcodeOrId: shortcode,
        igMediaIdNumeric,
        commentId: null,
        label:
          subtype === "ig_reel"
            ? "Instagram • Reels HD"
            : subtype === "ig_tv"
            ? "Instagram • IGTV Video"
            : "Instagram • Post / Carousel",
        capabilities:
          subtype === "ig_post"
            ? ["Galeri Carousel HD", "Video HD (.mp4)", "Audio (.mp3)"]
            : ["Video Full HD (.mp4)", "Ekstrak Audio (.mp3)"],
      };
    }
  }

  // 2. TIKTOK DETECTION
  if (
    host === "tiktok.com" ||
    host === "vt.tiktok.com" ||
    host === "vm.tiktok.com" ||
    host.endsWith(".tiktok.com")
  ) {
    const photoMatch = path.match(/\/@[^/]+\/photo\/(\d+)/i);
    if (photoMatch) {
      return {
        isValid: true,
        normalizedUrl: parsed.toString(),
        platform: "tiktok",
        subtype: "tiktok_photo",
        shortcodeOrId: photoMatch[1],
        igMediaIdNumeric: null,
        commentId: null,
        label: "TikTok • Photo Mode Slide",
        capabilities: ["Slide Foto Resolusi Asli", "Original Sound (.mp3)"],
      };
    }

    const videoMatch =
      path.match(/\/@[^/]+\/video\/(\d+)/i) || path.match(/\/v\/(\d+)/i);
    if (videoMatch) {
      return {
        isValid: true,
        normalizedUrl: parsed.toString(),
        platform: "tiktok",
        subtype: "tiktok_video",
        shortcodeOrId: videoMatch[1],
        igMediaIdNumeric: null,
        commentId: null,
        label: "TikTok • Video Tanpa Watermark",
        capabilities: ["Video HD Tanpa WM (.mp4)", "Ekstrak Sound (.mp3)"],
      };
    }

    const shortMatch = path.match(/^\/([A-Za-z0-9\-_]+)\/?$/);
    if (
      shortMatch &&
      (host === "vt.tiktok.com" ||
        host === "vm.tiktok.com" ||
        path.startsWith("/t/"))
    ) {
      return {
        isValid: true,
        normalizedUrl: parsed.toString(),
        platform: "tiktok",
        subtype: "tiktok_shortlink",
        shortcodeOrId: shortMatch[1],
        igMediaIdNumeric: null,
        commentId: null,
        label: "TikTok • Shortlink (vt/vm)",
        capabilities: [
          "Video HD Tanpa WM",
          "Photo Slide",
          "Original Sound (.mp3)",
        ],
      };
    }

    const fallbackTtMatch = path.match(/\/([A-Za-z0-9\-_]{6,})/);
    if (fallbackTtMatch) {
      return {
        isValid: true,
        normalizedUrl: parsed.toString(),
        platform: "tiktok",
        subtype: "tiktok_shortlink",
        shortcodeOrId: fallbackTtMatch[1],
        igMediaIdNumeric: null,
        commentId: null,
        label: "TikTok • Media",
        capabilities: ["Video HD Tanpa WM (.mp4)", "Sound (.mp3)"],
      };
    }
  }

  // 3. YOUTUBE DETECTION
  if (
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "youtu.be" ||
    host.endsWith(".youtube.com")
  ) {
    if (host === "youtu.be") {
      const id = path.replace(/^\//, "").split("/")[0];
      if (id) {
        return {
          isValid: true,
          normalizedUrl: parsed.toString(),
          platform: "youtube",
          subtype: "youtube_video",
          shortcodeOrId: id,
          igMediaIdNumeric: null,
          commentId: null,
          label: "YouTube • Video (youtu.be)",
          capabilities: [
            "Video 1080p/720p Muxed (.mp4)",
            "Ekstrak Audio (.mp3)",
          ],
        };
      }
    }

    const shortsMatch = path.match(/\/shorts\/([A-Za-z0-9\-_]+)/i);
    if (shortsMatch) {
      return {
        isValid: true,
        normalizedUrl: parsed.toString(),
        platform: "youtube",
        subtype: "youtube_shorts",
        shortcodeOrId: shortsMatch[1],
        igMediaIdNumeric: null,
        commentId: null,
        label: "YouTube • Shorts",
        capabilities: ["Shorts HD 1080p (.mp4)", "Ekstrak Audio (.mp3)"],
      };
    }

    const watchId = parsed.searchParams.get("v");
    if (watchId) {
      return {
        isValid: true,
        normalizedUrl: parsed.toString(),
        platform: "youtube",
        subtype: "youtube_video",
        shortcodeOrId: watchId,
        igMediaIdNumeric: null,
        commentId: null,
        label: "YouTube • Video Reguler",
        capabilities: [
          "Video 1080p & 720p Muxed (.mp4)",
          "Audio MP3 Jernih",
        ],
      };
    }
  }

  return {
    isValid: false,
    normalizedUrl: parsed.toString(),
    platform: "unknown",
    subtype: "unknown",
    shortcodeOrId: null,
    igMediaIdNumeric: null,
    commentId: null,
    label: "Domain Belum Didukung (Khusus IG, TikTok, YouTube)",
    capabilities: [],
  };
}
