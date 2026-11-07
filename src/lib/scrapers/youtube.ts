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
      .toUpperCase() || "YT";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <rect width="120" height="120" rx="60" fill="#141414"/>
    <circle cx="60" cy="60" r="56" fill="none" stroke="#c4956a" stroke-width="2"/>
    <text x="60" y="68" text-anchor="middle" fill="#f0ece6" font-family="monospace" font-size="28" font-weight="bold">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

interface YouTubeMetadata {
  title: string;
  author: string;
  thumbnail: string;
}

async function fetchYouTubeOembedMetadata(
  videoId: string
): Promise<YouTubeMetadata> {
  const defaultMeta: YouTubeMetadata = {
    title: `YouTube Video HD #${videoId}`,
    author: "youtube_channel",
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;

    const res = await fetch(oembedUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      return {
        title: data.title || defaultMeta.title,
        author: data.author_name || defaultMeta.author,
        thumbnail:
          data.thumbnail_url ||
          `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      };
    }
  } catch {
    // Gunakan metadata cadangan jika oEmbed lambat
  }

  return defaultMeta;
}

interface CliptoMediaItem {
  formatId?: number;
  label?: string;
  type?: string;
  ext?: string;
  extension?: string;
  quality?: string;
  width?: number;
  height?: number;
  bitrate?: number;
  audioQuality?: string | null;
  is_audio?: boolean;
  mimeType?: string;
  url?: string;
}

/**
 * Upstream Converter Scraper dengan Fallback Chain (PRD Bagian 3.2.3)
 * Provider 1: Clipto YouTube Stream Resolver (Mengambil stream 1080p Full HD itag 137/299, 720p HD itag 136/298, dan audio bitrate tertinggi itag 251/140 untuk di-remux via ffmpeg-static)
 * Provider 2: NoTube Upstream Muxed Stream Resolver
 * Provider 3: Piped API Instances
 */
async function resolveYouTubeUpstreamConverter(
  videoId: string
): Promise<{
  title?: string;
  author?: string;
  thumbnail?: string;
  videoHdUrl: string;
  videoSdUrl: string;
  audioMp3Url: string;
  provider: string;
} | null> {
  const canonicalYtUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Provider 1: Clipto YouTube API (Mendukung 1080p Full HD 1920x1080 & 720p HD 1280x720 + High-Bitrate Audio)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch("https://www.clipto.com/api/youtube", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({ url: canonicalYtUrl }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const medias: CliptoMediaItem[] = Array.isArray(data?.medias)
        ? data.medias
        : [];

      // Urutkan seluruh stream video MP4 (H.264) dari resolusi & bitrate tertinggi
      const mp4VideoStreams = medias
        .filter(
          (m) =>
            (m.ext === "mp4" || m.extension === "mp4") &&
            m.type !== "audio" &&
            Boolean(m.url)
        )
        .sort((a, b) => {
          const pixelsA = (a.width || 0) * (a.height || 0);
          const pixelsB = (b.width || 0) * (b.height || 0);
          if (pixelsB !== pixelsA) return pixelsB - pixelsA;
          return (b.bitrate || 0) - (a.bitrate || 0);
        });

      // Cari stream 1080p Full HD (itag 137 / 299 atau dimensi 1080p)
      const stream1080p =
        mp4VideoStreams.find(
          (m) =>
            m.formatId === 137 ||
            m.formatId === 299 ||
            m.height === 1080 ||
            m.width === 1080 ||
            m.quality?.includes("1080p")
        ) || mp4VideoStreams[0];

      // Cari stream 720p HD (itag 136 / 298 atau dimensi 720p)
      const stream720p =
        mp4VideoStreams.find(
          (m) =>
            m.formatId === 136 ||
            m.formatId === 298 ||
            m.height === 720 ||
            m.width === 720 ||
            m.quality?.includes("720p")
        ) ||
        stream1080p ||
        mp4VideoStreams[0];

      // Pilih stream audio M4A (itag 140) atau Opus (itag 251) asli dari video YouTube
      const sortedAudioStreams = medias
        .filter((m) => m.type === "audio" && Boolean(m.url))
        .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      const bestAudioStream =
        sortedAudioStreams.find((m) => m.formatId === 140) ||
        sortedAudioStreams.find((m) => m.formatId === 251) ||
        sortedAudioStreams[0] ||
        mp4VideoStreams.find((m) => m.formatId === 18) ||
        stream1080p;

      if (stream1080p?.url) {
        const rawAudioUrl = String(bestAudioStream?.url || stream1080p.url);
        const fastAudioUrl =
          rawAudioUrl.includes("googlevideo.com") &&
          !rawAudioUrl.includes("range=")
            ? `${rawAudioUrl}&range=0-9999999`
            : rawAudioUrl;

        return {
          title: data.title || undefined,
          author: data.author || undefined,
          thumbnail:
            `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` ||
            data.thumbnail ||
            undefined,
          videoHdUrl: String(stream1080p.url),
          videoSdUrl: String(stream720p?.url || stream1080p.url),
          audioMp3Url: fastAudioUrl,
          provider: "yt_clipto_1080p_hd_remux",
        };
      }
    }
  } catch {
    // Lanjut ke Provider 2
  }

  // Provider 2: NoTube Upstream Resolver
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);
    const form = new URLSearchParams({
      url: canonicalYtUrl,
      format: "mp4hd",
      lang: "en",
      subscribed: "false",
    });

    const ntRes = await fetch("https://s64.notube.net/recover_weight.php", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      },
      body: form.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (ntRes.ok) {
      const ntData = await ntRes.json();
      if (ntData?.url_mp4_youtube) {
        const streamUrl = String(ntData.url_mp4_youtube);
        return {
          videoHdUrl: streamUrl,
          videoSdUrl: streamUrl,
          audioMp3Url: streamUrl,
          provider: "yt_notube_muxed_stream",
        };
      }
    }
  } catch {
    // Lanjut ke Provider 3
  }

  // Provider 3: Piped Upstream Instances
  const upstreamInstances = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.tokhmi.xyz",
  ];

  for (const base of upstreamInstances) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${base}/streams/${encodeURIComponent(videoId)}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        const videoStreams = Array.isArray(data?.videoStreams)
          ? data.videoStreams
          : [];
        const audioStreams = Array.isArray(data?.audioStreams)
          ? data.audioStreams
          : [];

        const muxedStreams = videoStreams.filter(
          (s: { videoOnly?: boolean; url?: string }) => !s.videoOnly && s.url
        );
        const bestVideo = muxedStreams[0]?.url || videoStreams[0]?.url;
        const bestAudio = audioStreams[0]?.url || bestVideo;

        if (bestVideo) {
          return {
            videoHdUrl: String(bestVideo),
            videoSdUrl: String(muxedStreams[1]?.url || bestVideo),
            audioMp3Url: String(bestAudio),
            provider: `yt_upstream_converter (${new URL(base).hostname})`,
          };
        }
      }
    } catch {
      // Lanjut ke instance berikutnya
    }
  }

  return null;
}

export async function scrapeYouTube(
  detected: DetectedUrlInfo,
  allowSimulationFallback = true
): Promise<UnifiedExtractionResult> {
  const startMs = Date.now();
  const videoId = detected.shortcodeOrId || "y_CXsHlXcYE";
  const isShorts = detected.subtype === "youtube_shorts";

  const [meta, upstream] = await Promise.all([
    fetchYouTubeOembedMetadata(videoId),
    resolveYouTubeUpstreamConverter(videoId),
  ]);

  if (upstream) {
    const resolvedTitle = upstream.title || meta.title;
    const resolvedAuthor = upstream.author || meta.author;
    const resolvedThumb = upstream.thumbnail || meta.thumbnail;

    return {
      status: true,
      platform: "youtube",
      contentType: "video",
      author: {
        username: resolvedAuthor,
        avatar: createAvatarDataUri(resolvedAuthor),
      },
      comment: null,
      media: {
        title: resolvedTitle,
        thumbnail: resolvedThumb,
        videoHdUrl: upstream.videoHdUrl,
        videoSdUrl: upstream.videoSdUrl,
        audioMp3Url: upstream.audioMp3Url,
        carouselItems: [],
      },
      meta: {
        urlHash: `youtube:${videoId}:media`,
        shortcode: videoId,
        cached: false,
        latencyMs: Date.now() - startMs,
        provider: upstream.provider,
        isSimulatedFallback: false,
      },
    };
  }

  if (!allowSimulationFallback) {
    throw new Error(
      "Upstream converter YouTube sedang sibuk. Silakan coba beberapa saat lagi."
    );
  }

  return {
    status: true,
    platform: "youtube",
    contentType: "video",
    author: {
      username: meta.author,
      avatar: createAvatarDataUri(meta.author),
    },
    comment: null,
    media: {
      title:
        meta.title !== `YouTube Video HD #${videoId}`
          ? meta.title
          : isShorts
          ? `YouTube Shorts Vertical 1080p #${videoId}`
          : `YouTube Video Muxed (Video + Audio) #${videoId}`,
      thumbnail:
        meta.thumbnail ||
        createPosterSvgDataUri(
          `YOUTUBE • ${videoId}`,
          "MUXED MP4 + 320KBPS MP3"
        ),
      videoHdUrl: `/api/proxy-download?demo=1&format=mp4&quality=1080p&platform=youtube&id=${videoId}`,
      videoSdUrl: `/api/proxy-download?demo=1&format=mp4&quality=720p&platform=youtube&id=${videoId}`,
      audioMp3Url: `/api/proxy-download?demo=1&format=mp3&platform=youtube&id=${videoId}`,
      carouselItems: [],
    },
    meta: {
      urlHash: `youtube:${videoId}:media`,
      shortcode: videoId,
      cached: false,
      latencyMs: Date.now() - startMs,
      provider: "yt_muxed_converter_chain",
      isSimulatedFallback: true,
    },
  };
}
