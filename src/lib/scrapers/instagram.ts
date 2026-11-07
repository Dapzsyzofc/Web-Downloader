import * as cheerio from "cheerio";
import {
  UnifiedExtractionResult,
  acquireRoundRobinSession,
  reportSessionFailure,
  resetSessionSuccess,
} from "../supabase";
import {
  DetectedUrlInfo,
  detectSocialUrl,
  shortcodeToMediaId,
} from "../url-detector";

const IPHONE_SAFARI_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

const FB_CRAWLER_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

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
      .toUpperCase() || "IG";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <rect width="120" height="120" rx="60" fill="#141414"/>
    <circle cx="60" cy="60" r="56" fill="none" stroke="#c4956a" stroke-width="2"/>
    <text x="60" y="68" text-anchor="middle" fill="#f0ece6" font-family="monospace" font-size="28" font-weight="bold">${initials}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

interface IgCommentLookupResult {
  id: string;
  text: string;
  username: string;
  avatar: string;
  sourceLabel: string;
  provider: string;
}

interface IgScrapedMedia {
  mediaId?: string;
  title: string;
  fullCaption: string;
  username: string;
  avatar: string;
  thumbnail: string;
  videoHdUrl: string | null;
  audioMp3Url: string | null;
  carouselItems: Array<{
    type: "image" | "video";
    url: string;
    previewUrl?: string;
    resolution: string;
  }>;
  embeddedComments: Array<{
    id: string;
    text: string;
    username: string;
    avatar?: string;
  }>;
  provider: string;
}

/**
 * Resolusi tautan /share/ Instagram ke URL kanonis (/reel/ atau /p/)
 */
async function resolveInstagramShareRedirect(
  detected: DetectedUrlInfo
): Promise<DetectedUrlInfo> {
  if (detected.subtype !== "ig_share") return detected;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(detected.normalizedUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": IPHONE_SAFARI_UA,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.url && res.url !== detected.normalizedUrl) {
      const reDetected = detectSocialUrl(res.url);
      if (reDetected.isValid && reDetected.platform === "instagram") {
        return reDetected;
      }
    }
  } catch {
    // Tetap gunakan informasi awal jika gagal redirect
  }
  return detected;
}

/**
 * 1. Custom IG Comment Extractor (PRD Bagian 3.2.1)
 * Konversi shortcode -> Base64 media_id -> GET /api/v1/media/{media_id}/comments/?target_comment_id={comment_id}
 */
async function extractInstagramCommentById(
  shortcode: string,
  commentId: string,
  knownMediaId?: string
): Promise<IgCommentLookupResult | null> {
  const mediaId = knownMediaId || shortcodeToMediaId(shortcode);
  const session = await acquireRoundRobinSession("instagram");

  if (mediaId && session) {
    try {
      const endpoints = [
        `https://i.instagram.com/api/v1/media/${mediaId}/comments/?can_support_threading=true&target_comment_id=${encodeURIComponent(
          commentId
        )}`,
        `https://www.instagram.com/api/v1/media/${mediaId}/comments/?can_support_threading=true&target_comment_id=${encodeURIComponent(
          commentId
        )}&permalink_enabled=true`,
      ];

      for (const endpoint of endpoints) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);

        const res = await fetch(endpoint, {
          method: "GET",
          headers: {
            Cookie: session.session_cookie,
            "User-Agent": session.user_agent || IPHONE_SAFARI_UA,
            "X-IG-App-ID": "936619743392459",
            Accept: "application/json",
          },
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (res.status === 401 || res.status === 403 || res.status === 429) {
          await reportSessionFailure(session.id);
          continue;
        }

        if (res.ok) {
          const contentType = res.headers.get("content-type") || "";
          if (!contentType.includes("json")) continue;

          await resetSessionSuccess(session.id);
          const data = await res.json();
          const commentsList = Array.isArray(data?.comments)
            ? data.comments
            : Array.isArray(data?.parent_comments)
            ? data.parent_comments
            : [];

          const matched =
            commentsList.find(
              (c: Record<string, unknown>) =>
                String(c?.pk || c?.id || "") === String(commentId)
            ) ||
            data?.target_comment ||
            commentsList[0];

          if (matched && typeof matched.text === "string") {
            const userObj = (matched.user || {}) as Record<string, string>;
            const uname = userObj.username || "ig_commenter";
            return {
              id: String(matched.pk || commentId),
              text: matched.text,
              username: uname,
              avatar: userObj.profile_pic_url || createAvatarDataUri(uname),
              sourceLabel: `Komentar Instagram #${commentId}`,
              provider: `ig_api_v1_comments (${session.account_label})`,
            };
          }
        }
      }
    } catch {
      // Lanjut ke ekstraksi dari contextJSON / OpenGraph
    }
  }

  return null;
}

/**
 * 2. Multi-Fallback Media, Comment (XIGComment) & Caption Scraper (PRD Bagian 3.2.1)
 * Metode 0: Polaris RelayPrefetchedStreamCache Parser (Mengekstrak komentar XIGComment asli + video_versions HD tanpa login)
 * Metode 1: Embed Captioned contextJSON Parser (iPhone Safari UA)
 * Metode 2: OpenGraph Crawler Meta Parser (facebookexternalhit/1.1 + Cheerio)
 * Metode 3: Direct GraphQL & Upstream HTML Scraper
 */
async function scrapeInstagramPolarisRelay(
  shortcode: string,
  commentId?: string | null
): Promise<IgScrapedMedia | null> {
  const candidates = [
    `https://www.instagram.com/reel/${shortcode}/${
      commentId ? `?comment_id=${encodeURIComponent(commentId)}` : ""
    }`,
    `https://www.instagram.com/p/${shortcode}/${
      commentId ? `?comment_id=${encodeURIComponent(commentId)}` : ""
    }`,
  ];

  for (const url of candidates) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6500);
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
          "Sec-Ch-Ua":
            '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) continue;
      const html = await res.text();
      const scripts =
        html.match(
          /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g
        ) || [];

      const embeddedComments: Array<{
        id: string;
        text: string;
        username: string;
        avatar?: string;
      }> = [];
      const seenCommentIds = new Set<string>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let polarisMedia: any = null;
      let endCursor = "";
      let hasNextPage = false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const walkJson = (node: any) => {
        if (!node || typeof node !== "object") return;
        if (node.__typename === "XIGComment" && typeof node.text === "string") {
          const cid = String(node.pk || node.id || "");
          if (cid && !seenCommentIds.has(cid)) {
            seenCommentIds.add(cid);
            embeddedComments.push({
              id: cid,
              text: node.text,
              username: node.user?.username || "ig_commenter",
              avatar: node.user?.profile_pic_url || undefined,
            });
          }
        }
        if (
          typeof node.end_cursor === "string" &&
          typeof node.has_next_page === "boolean"
        ) {
          endCursor = node.end_cursor;
          hasNextPage = node.has_next_page;
        }
        if (node.xig_polaris_media && !polarisMedia) {
          polarisMedia = node.xig_polaris_media;
        }
        for (const val of Object.values(node)) {
          if (val && typeof val === "object") {
            walkJson(val);
          }
        }
      };

      for (const s of scripts) {
        if (s.includes("XIGComment") || s.includes("xig_polaris_media")) {
          const rawJson = s
            .replace(/^<script[^>]*>/, "")
            .replace(/<\/script>$/, "");
          try {
            walkJson(JSON.parse(rawJson));
          } catch {
            // abaikan blok script non-standar
          }
        }
      }

      // Jika comment_id spesifik belum ada di 12 komentar pertama, telusuri halaman komentar berikutnya via /api/graphql
      if (
        commentId &&
        !embeddedComments.some((c) => c.id === commentId) &&
        hasNextPage &&
        endCursor &&
        polarisMedia?.pk
      ) {
        try {
          const rawCookies =
            typeof res.headers.getSetCookie === "function"
              ? res.headers.getSetCookie()
              : [res.headers.get("set-cookie") || ""];
          const cookieHeader = rawCookies
            .map((c) => c.split(";")[0])
            .filter(Boolean)
            .join("; ");
          const csrfMatch =
            cookieHeader.match(/csrftoken=([^;]+)/) ||
            html.match(/"csrf_token":"([^"]+)"/);
          const csrfToken = csrfMatch ? csrfMatch[1] : "";
          const lsdMatch =
            html.match(/"LSD",\[\],\{"token":"([^"]+)"\}/) ||
            html.match(/name="lsd" value="([^"]+)"/);
          const lsd = lsdMatch ? lsdMatch[1] : "";
          const hsiMatch = html.match(/"hsi":"(\d+)"/);
          const hsi = hsiMatch ? hsiMatch[1] : "";
          const revMatch = html.match(/"server_revision":(\d+)/);
          const rev = revMatch ? revMatch[1] : "";
          const hsMatch = html.match(/"haste_session":"([^"]+)"/);
          const hs = hsMatch ? hsMatch[1] : "";
          const mediaIdStr = String(polarisMedia.pk);

          let currentCursor: string = endCursor;
          for (let page = 1; page <= 25 && currentCursor; page++) {
            const gqlBody: URLSearchParams = new URLSearchParams({
              av: "0",
              __d: "www",
              __user: "0",
              __a: "1",
              __req: String(page),
              __hs: hs,
              dpr: "1",
              __ccg: "EXCELLENT",
              __rev: rev,
              __hsi: hsi,
              __comet_req: "7",
              lsd,
              fb_api_caller_class: "RelayModern",
              fb_api_req_friendly_name:
                "PolarisLoggedOutDesktopWWWPostCommentsPaginationQuery",
              variables: JSON.stringify({
                after: currentCursor,
                first: 50,
                media_id: mediaIdStr,
              }),
              server_timestamps: "true",
              doc_id: "29066632289630283",
            });

            const gqlRes = await fetch(
              "https://www.instagram.com/api/graphql",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Cookie: cookieHeader,
                  "X-CSRFToken": csrfToken,
                  "X-FB-LSD": lsd,
                  "X-IG-App-ID": "936619743392459",
                  "X-IG-D": "www",
                  "X-ASBD-ID": "129477",
                  "X-FB-Friendly-Name":
                    "PolarisLoggedOutDesktopWWWPostCommentsPaginationQuery",
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                  Referer: `https://www.instagram.com/reel/${shortcode}/`,
                  Origin: "https://www.instagram.com",
                  "Sec-Fetch-Dest": "empty",
                  "Sec-Fetch-Mode": "cors",
                  "Sec-Fetch-Site": "same-origin",
                },
                body: gqlBody.toString(),
              }
            );

            if (!gqlRes.ok) break;
            const gqlJson = await gqlRes.json();
            const conn =
              gqlJson?.data?.xig_polaris_media?.comments_connection;
            const edges = Array.isArray(conn?.edges) ? conn.edges : [];
            let foundTarget = false;

            for (const edge of edges) {
              const n = edge?.node;
              if (n && typeof n.text === "string") {
                const cid = String(n.pk || n.id || "");
                if (cid && !seenCommentIds.has(cid)) {
                  seenCommentIds.add(cid);
                  embeddedComments.push({
                    id: cid,
                    text: n.text,
                    username: n.user?.username || "ig_commenter",
                    avatar: n.user?.profile_pic_url || undefined,
                  });
                }
                if (cid === commentId) {
                  foundTarget = true;
                  break;
                }
              }
            }

            if (foundTarget) break;
            if (
              !conn?.page_info?.has_next_page ||
              !conn?.page_info?.end_cursor
            ) {
              break;
            }
            currentCursor = String(conn.page_info.end_cursor);
          }
        } catch {
          // Lanjutkan dengan komentar yang sudah terkumpul jika pagination gagal
        }
      }

      const m = polarisMedia?.if_not_gated_logged_out;
      if (m) {
        const owner = m.user?.username || "instagram_creator";
        const avatar =
          m.user?.profile_pic_url || createAvatarDataUri(owner);
        const rawCaption = m.caption?.text || "";
        const cleanTitle = rawCaption
          ? rawCaption.split("\n")[0].slice(0, 110)
          : `Instagram Media (@${owner})`;
        const thumb =
          m.display_uri ||
          m.image_versions2?.candidates?.[0]?.url ||
          createPosterSvgDataUri("INSTAGRAM", `@${owner} • ${shortcode}`);

        const videoHdUrl =
          m.video_versions?.[0]?.url
            ? String(m.video_versions[0].url)
            : null;

        const carouselRaw = Array.isArray(m.carousel_media)
          ? m.carousel_media
          : [];
        const carouselItems =
          carouselRaw.length > 0
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              carouselRaw.map((item: any) => {
                const vUrl = item.video_versions?.[0]?.url;
                const iUrl =
                  item.display_uri ||
                  item.image_versions2?.candidates?.[0]?.url ||
                  thumb;
                const w = item.original_width || 1080;
                const h = item.original_height || 1350;
                return {
                  type: (vUrl ? "video" : "image") as "video" | "image",
                  url: String(vUrl || iUrl),
                  previewUrl: String(iUrl),
                  resolution: `${w}x${h}`,
                };
              })
            : !videoHdUrl && thumb
            ? [
                {
                  type: "image" as const,
                  url: String(thumb),
                  previewUrl: String(thumb),
                  resolution: `${m.original_width || 1080}x${
                    m.original_height || 1350
                  }`,
                },
              ]
            : [];

        return {
          mediaId: polarisMedia.pk ? String(polarisMedia.pk) : undefined,
          title: cleanTitle,
          fullCaption: rawCaption || cleanTitle,
          username: owner,
          avatar,
          thumbnail: thumb,
          videoHdUrl:
            videoHdUrl ||
            carouselItems.find((i: { type: string }) => i.type === "video")
              ?.url ||
            null,
          audioMp3Url: null,
          carouselItems: carouselRaw.length > 0 ? carouselItems : [],
          embeddedComments,
          provider: "ig_polaris_relay_xigcomment",
        };
      }
    } catch {
      // Coba kandidat berikutnya
    }
  }
  return null;
}

async function scrapeInstagramMediaUpstream(
  shortcode: string,
  fullUrl: string,
  commentId?: string | null
): Promise<IgScrapedMedia | null> {
  // Metode 0: Polaris RelayPrefetchedStreamCache (Mengekstrak komentar XIGComment asli & video HD)
  const polarisData = await scrapeInstagramPolarisRelay(shortcode, commentId);
  if (polarisData && (polarisData.videoHdUrl || polarisData.carouselItems.length > 0)) {
    return polarisData;
  }

  // Metode 1: Instagram Embed Captioned contextJSON Parser (Menghasilkan video_url 1080p/HD, caption asli, dan carousel asli)
  const embedEndpoints = [
    `https://www.instagram.com/reel/${shortcode}/embed/captioned/`,
    `https://www.instagram.com/p/${shortcode}/embed/captioned/`,
  ];

  for (const embedUrl of embedEndpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const embedRes = await fetch(embedUrl, {
        headers: {
          "User-Agent": IPHONE_SAFARI_UA,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!embedRes.ok) continue;
      const html = await embedRes.text();

      // 1A: Parse contextJSON dari dalam script Embed Instagram
      const ctxMatch = html.match(/"contextJSON"\s*:\s*("(?:\\.|[^"\\])*")/);
      if (ctxMatch) {
        try {
          const decodedJsonString = JSON.parse(ctxMatch[1]);
          const parsedCtx = JSON.parse(decodedJsonString);
          const media = parsedCtx?.gql_data?.shortcode_media;

          if (media) {
            const owner = media.owner?.username || "instagram_creator";
            const avatar =
              media.owner?.profile_pic_url || createAvatarDataUri(owner);
            const rawCaption =
              media.edge_media_to_caption?.edges?.[0]?.node?.text ||
              media.caption ||
              "";
            const cleanTitle = rawCaption
              ? rawCaption.split("\n")[0].slice(0, 110)
              : `Instagram Media (@${owner})`;
            const thumb =
              media.display_url ||
              media.thumbnail_src ||
              createPosterSvgDataUri("INSTAGRAM", `@${owner} • ${shortcode}`);

            // Cek apakah ada komentar di dalam edge_media_to_parent_comment / edge_media_to_comment
            const embeddedComments: Array<{
              id: string;
              text: string;
              username: string;
              avatar?: string;
            }> = [];
            const commentEdges =
              media.edge_media_to_parent_comment?.edges ||
              media.edge_media_to_comment?.edges ||
              media.edge_media_preview_comment?.edges ||
              [];
            if (Array.isArray(commentEdges)) {
              for (const edge of commentEdges) {
                const cNode = edge?.node;
                if (cNode && typeof cNode.text === "string") {
                  embeddedComments.push({
                    id: String(cNode.id || ""),
                    text: cNode.text,
                    username: cNode.owner?.username || owner,
                    avatar: cNode.owner?.profile_pic_url,
                  });
                }
              }
            }

            // Cek apakah berupa Carousel (Multi-Slide)
            const sidecarEdges = media.edge_sidecar_to_children?.edges;
            if (Array.isArray(sidecarEdges) && sidecarEdges.length > 0) {
              const items = sidecarEdges.map(
                (edge: { node: Record<string, unknown> }) => {
                  const node = edge.node;
                  const isVid = Boolean(node.is_video && node.video_url);
                  const w =
                    Number(
                      (node.dimensions as { width?: number })?.width
                    ) || 1080;
                  const h =
                    Number(
                      (node.dimensions as { height?: number })?.height
                    ) || 1350;
                  return {
                    type: (isVid ? "video" : "image") as "video" | "image",
                    url: String(isVid ? node.video_url : node.display_url),
                    previewUrl: String(node.display_url || thumb),
                    resolution: `${w}x${h}`,
                  };
                }
              );

              const firstVideo =
                items.find((i: { type: string }) => i.type === "video")?.url ||
                null;
              return {
                mediaId: media.id ? String(media.id) : undefined,
                title: cleanTitle,
                fullCaption: rawCaption || cleanTitle,
                username: owner,
                avatar,
                thumbnail: thumb,
                videoHdUrl: firstVideo,
                audioMp3Url: null,
                carouselItems: items,
                embeddedComments,
                provider: "ig_embed_context_json",
              };
            }

            const videoHdUrl = media.video_url ? String(media.video_url) : null;
            const singleItems =
              !videoHdUrl && media.display_url
                ? [
                    {
                      type: "image" as const,
                      url: String(media.display_url),
                      previewUrl: String(media.display_url),
                      resolution: "1080x1350",
                    },
                  ]
                : [];

            return {
              mediaId: media.id ? String(media.id) : undefined,
              title: cleanTitle,
              fullCaption: rawCaption || cleanTitle,
              username: owner,
              avatar,
              thumbnail: thumb,
              videoHdUrl,
              audioMp3Url: null,
              carouselItems: singleItems,
              embeddedComments,
              provider: "ig_embed_context_json",
            };
          }
        } catch {
          // Lanjut ke parsing DOM Cheerio pada halaman embed
        }
      }

      // 1B: Parsing DOM Embed menggunakan Cheerio jika contextJSON tidak ditemukan
      const $ = cheerio.load(html);
      const videoSrc =
        $("video.EmbeddedMediaVideo").attr("src") ||
        $('meta[property="og:video"]').attr("content");
      const imgSrc =
        $("img.EmbeddedMediaImage").attr("src") ||
        $('meta[property="og:image"]').attr("content");
      const username =
        $(".UsernameText").first().text().trim() ||
        $(".Header .Username").first().text().trim() ||
        "instagram_creator";
      const captionEl = $(".Caption").first().clone();
      captionEl.find(".CaptionUsername, .CaptionComments").remove();
      const rawCaption = captionEl.text().trim();

      if (videoSrc || imgSrc) {
        return {
          title: rawCaption
            ? rawCaption.split("\n")[0].slice(0, 110)
            : `Instagram Post (@${username})`,
          fullCaption: rawCaption || `Instagram Post (@${username})`,
          username,
          avatar: createAvatarDataUri(username),
          thumbnail:
            imgSrc ||
            createPosterSvgDataUri("INSTAGRAM", `@${username} • ${shortcode}`),
          videoHdUrl: videoSrc || null,
          audioMp3Url: null,
          carouselItems:
            !videoSrc && imgSrc
              ? [
                  {
                    type: "image",
                    url: imgSrc,
                    previewUrl: imgSrc,
                    resolution: "1080x1350",
                  },
                ]
              : [],
          embeddedComments: [],
          provider: "ig_cheerio_embed_dom",
        };
      }
    } catch {
      // Coba endpoint embed berikutnya
    }
  }

  // Metode 2: OpenGraph Crawler Meta Parser (facebookexternalhit/1.1 + Cheerio)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const targetUrl = `https://www.instagram.com/reel/${shortcode}/${
      commentId ? `?comment_id=${encodeURIComponent(commentId)}` : ""
    }`;

    const ogRes = await fetch(targetUrl, {
      headers: {
        "User-Agent": FB_CRAWLER_UA,
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (ogRes.ok) {
      const html = await ogRes.text();
      const $ = cheerio.load(html);
      const ogTitle = $('meta[property="og:title"]').attr("content") || "";
      const ogDesc =
        $('meta[property="og:description"]').attr("content") ||
        $('meta[name="description"]').attr("content") ||
        "";
      const ogImage =
        $('meta[property="og:image"]').attr("content") ||
        $('meta[name="twitter:image"]').attr("content") ||
        "";
      const ogVideo =
        $('meta[property="og:video"]').attr("content") ||
        $('meta[property="og:video:secure_url"]').attr("content") ||
        "";
      const twitterTitle =
        $('meta[name="twitter:title"]').attr("content") || "";

      if (ogTitle || ogImage) {
        const userFromTwitter = twitterTitle.match(/\(@([A-Za-z0-9._]+)\)/)?.[1];
        const userFromDesc = ogDesc.match(/-\s*@([A-Za-z0-9._]+)\s+on/i)?.[1];
        const username =
          userFromTwitter || userFromDesc || "instagram_creator";

        // Ekstrak teks kutipan dari og:title ("... on Instagram: \"...\"")
        const quoteMatch = ogTitle.match(/on Instagram:\s*"([\s\S]*)"$/i);
        const extractedCaption = quoteMatch
          ? quoteMatch[1].trim()
          : ogDesc.replace(/\s*-\s*@[A-Za-z0-9._]+\s+on\s+.*$/i, "").trim() ||
            ogTitle;

        return {
          title: extractedCaption.split("\n")[0].slice(0, 110),
          fullCaption: extractedCaption,
          username,
          avatar: createAvatarDataUri(username),
          thumbnail:
            ogImage ||
            createPosterSvgDataUri("INSTAGRAM", `@${username} • ${shortcode}`),
          videoHdUrl: ogVideo || null,
          audioMp3Url: null,
          carouselItems:
            !ogVideo && ogImage
              ? [
                  {
                    type: "image",
                    url: ogImage,
                    previewUrl: ogImage,
                    resolution: "1080x1350",
                  },
                ]
              : [],
          embeddedComments: [],
          provider: "ig_opengraph_crawler",
        };
      }
    }
  } catch {
    // Lanjut ke Metode 3
  }

  // Metode 3: Upstream HTML Scraper (Indown / FastDl style POST + Cheerio)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const form = new URLSearchParams();
    form.set("link", fullUrl);

    const upRes = await fetch("https://indown.io/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": IPHONE_SAFARI_UA,
      },
      body: form.toString(),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (upRes.ok) {
      const html = await upRes.text();
      const $ = cheerio.load(html);
      const mediaLinks: Array<{
        type: "image" | "video";
        url: string;
        resolution: string;
      }> = [];

      $("#result a[href], .download-btn[href], video source[src]").each(
        (_, el) => {
          const rawHref = $(el).attr("href") || $(el).attr("src") || "";
          if (rawHref.startsWith("http")) {
            const isVideo =
              rawHref.includes(".mp4") ||
              $(el).is("source") ||
              $(el).text().toLowerCase().includes("video");
            mediaLinks.push({
              type: isVideo ? "video" : "image",
              url: rawHref,
              resolution: "1080x1350",
            });
          }
        }
      );

      if (mediaLinks.length > 0) {
        const firstVid =
          mediaLinks.find((m) => m.type === "video")?.url || null;
        return {
          title: `Instagram Media (${shortcode})`,
          fullCaption: `Instagram Media (${shortcode})`,
          username: "instagram_creator",
          avatar: createAvatarDataUri("IG"),
          thumbnail: createPosterSvgDataUri("INSTAGRAM", shortcode),
          videoHdUrl: firstVid,
          audioMp3Url: null,
          carouselItems: mediaLinks.length > 1 ? mediaLinks : [],
          embeddedComments: [],
          provider: "ig_cheerio_upstream_scraper",
        };
      }
    }
  } catch {
    // Fallback
  }

  return null;
}

export async function scrapeInstagram(
  rawDetected: DetectedUrlInfo,
  allowSimulationFallback = true
): Promise<UnifiedExtractionResult> {
  const startMs = Date.now();
  const detected = await resolveInstagramShareRedirect(rawDetected);
  const shortcode = detected.shortcodeOrId || "DfYwaRCguG4";
  const commentId = detected.commentId;

  // 1. Scrape Media & Caption Asli dari Instagram terlebih dahulu
  const upstreamMedia = await scrapeInstagramMediaUpstream(
    shortcode,
    detected.normalizedUrl,
    commentId
  );

  // 2. Fokus hanya pada 1 komentar target jika tautan mengandung ?comment_id=...
  let commentData: IgCommentLookupResult | null = null;
  if (commentId) {
    const exactFromEmbedded = upstreamMedia?.embeddedComments.find(
      (c) => c.id === commentId
    );
    if (exactFromEmbedded) {
      commentData = {
        id: exactFromEmbedded.id,
        text: exactFromEmbedded.text,
        username: exactFromEmbedded.username,
        avatar:
          exactFromEmbedded.avatar ||
          createAvatarDataUri(exactFromEmbedded.username),
        sourceLabel: `Komentar Instagram (@${exactFromEmbedded.username} • #${exactFromEmbedded.id})`,
        provider: "ig_polaris_xigcomment",
      };
    } else {
      commentData = await extractInstagramCommentById(
        shortcode,
        commentId,
        upstreamMedia?.mediaId
      );
      if (
        !commentData &&
        upstreamMedia?.embeddedComments &&
        upstreamMedia.embeddedComments.length > 0
      ) {
        const primaryComment = upstreamMedia.embeddedComments[0];
        commentData = {
          id: primaryComment.id,
          text: primaryComment.text,
          username: primaryComment.username,
          avatar:
            primaryComment.avatar ||
            createAvatarDataUri(primaryComment.username),
          sourceLabel: `Komentar Instagram (@${primaryComment.username} • #${primaryComment.id})`,
          provider: "ig_polaris_xigcomment_single",
        };
      }
    }
  }

  if (upstreamMedia) {
    const isCarousel = upstreamMedia.carouselItems.length > 1;
    const contentType = commentId
      ? "comment"
      : isCarousel
      ? "photo_carousel"
      : "video";

    const resolvedComment = commentData;

    return {
      status: true,
      platform: "instagram",
      contentType,
      author: {
        username: upstreamMedia.username,
        avatar: upstreamMedia.avatar,
      },
      comment: resolvedComment
        ? {
            id: resolvedComment.id,
            text: resolvedComment.text,
            username: resolvedComment.username,
            avatar: resolvedComment.avatar,
            sourceLabel: resolvedComment.sourceLabel,
          }
        : null,
      media: {
        title: upstreamMedia.title,
        thumbnail: upstreamMedia.thumbnail,
        videoHdUrl: upstreamMedia.videoHdUrl,
        videoSdUrl: upstreamMedia.videoHdUrl,
        audioMp3Url: upstreamMedia.audioMp3Url || upstreamMedia.videoHdUrl,
        carouselItems: upstreamMedia.carouselItems,
      },
      meta: {
        urlHash: `instagram:${shortcode}:${commentId || "media"}`,
        shortcode,
        cached: false,
        latencyMs: Date.now() - startMs,
        provider: commentData?.provider || upstreamMedia.provider,
        isSimulatedFallback: false,
      },
    };
  }

  if (!allowSimulationFallback) {
    throw new Error(
      "Postingan Instagram tidak ditemukan atau bersifat privat. Pastikan tautan berasal dari akun publik."
    );
  }

  // Fallback jika tautan sampel fiktif atau jaringan lokal terputus
  const isCarouselPost = detected.subtype === "ig_post" && !commentId;
  const contentType = commentId
    ? "comment"
    : isCarouselPost
    ? "photo_carousel"
    : "video";

  const authorUsername = "dafian.studio";
  const simulatedComment = {
    id: commentId || shortcode,
    text: `Teks komentar & caption dari Reel Instagram #${shortcode} siap disalin ke clipboard Anda.`,
    sourceLabel: commentId
      ? `Komentar Instagram #${commentId}`
      : `Caption Instagram #${shortcode}`,
  };

  const carouselItems = isCarouselPost
    ? [
        {
          type: "image" as const,
          url: `/api/proxy-download?demo=1&format=jpg&platform=instagram&id=${shortcode}_slide_1`,
          previewUrl: createPosterSvgDataUri(
            `SLIDE 01 • ${shortcode}`,
            "1080x1350 ORIGINAL JPG"
          ),
          resolution: "1080x1350",
        },
        {
          type: "image" as const,
          url: `/api/proxy-download?demo=1&format=jpg&platform=instagram&id=${shortcode}_slide_2`,
          previewUrl: createPosterSvgDataUri(
            `SLIDE 02 • ${shortcode}`,
            "1080x1350 ORIGINAL JPG"
          ),
          resolution: "1080x1350",
        },
      ]
    : [];

  return {
    status: true,
    platform: "instagram",
    contentType,
    author: {
      username: authorUsername,
      avatar: createAvatarDataUri(authorUsername),
    },
    comment: simulatedComment,
    media: {
      title: `Instagram Reels Full HD 1080p #${shortcode}`,
      thumbnail: createPosterSvgDataUri(
        `INSTAGRAM • ${shortcode}`,
        "1080P ORIGINAL STREAM"
      ),
      videoHdUrl: `/api/proxy-download?demo=1&format=mp4&quality=1080p&platform=instagram&id=${shortcode}`,
      videoSdUrl: `/api/proxy-download?demo=1&format=mp4&quality=720p&platform=instagram&id=${shortcode}`,
      audioMp3Url: `/api/proxy-download?demo=1&format=mp3&platform=instagram&id=${shortcode}`,
      carouselItems,
    },
    meta: {
      urlHash: `instagram:${shortcode}:${commentId || "media"}`,
      shortcode,
      cached: false,
      latencyMs: Date.now() - startMs,
      provider: "ig_serverless_engine",
      isSimulatedFallback: true,
    },
  };
}
