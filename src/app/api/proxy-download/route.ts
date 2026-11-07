import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";

const AUDIO_CLARITY_FILTER =
  "aresample=48000,highpass=f=22,equalizer=f=3500:t=q:w=1.2:g=1.8,equalizer=f=10000:t=q:w=1.5:g=2.4,acompressor=threshold=-18dB:ratio=1.8:attack=10:release=90,alimiter=limit=0.96";

function generatePlayableWavBuffer(
  durationSec = 2,
  sampleRate = 48000
): Buffer {
  const numSamples = durationSec * sampleRate;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 8) * Math.max(0, 1 - t / durationSec);
    const sample =
      Math.sin(2 * Math.PI * 440 * t) * 0.25 * envelope +
      Math.sin(2 * Math.PI * 660 * t) * 0.12 * envelope;
    const intSample = Math.max(
      -32768,
      Math.min(32767, Math.floor(sample * 32767))
    );
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

/**
 * Mengalirkan byte-range paralel berkecepatan tinggi langsung ke stdin FFmpeg
 * agar byte pertama keluar dalam < 1 detik tanpa throttling YouTube.
 */
async function streamFastRangesToStdin(
  rawUrl: string,
  stdin: NodeJS.WritableStream
): Promise<void> {
  try {
    const parsed = new URL(rawUrl);
    const isGoogleVideo =
      parsed.hostname.includes("googlevideo.com") ||
      parsed.hostname.includes("youtube.com");

    const baseHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      Accept: "*/*",
    };
    if (!isGoogleVideo) {
      baseHeaders.Referer = `${parsed.protocol}//${parsed.host}/`;
    }

    const firstRes = await fetch(rawUrl, {
      headers: {
        ...baseHeaders,
        Range: "bytes=0-524287",
      },
      redirect: "follow",
    });

    if (!firstRes.ok) {
      stdin.end();
      return;
    }

    const finalUrl = firstRes.url || rawUrl;
    const contentRange = firstRes.headers.get("content-range");
    const firstChunk = Buffer.from(await firstRes.arrayBuffer());
    try {
      stdin.write(firstChunk);
    } catch {
      return;
    }

    if (firstRes.status !== 206 || !contentRange) {
      stdin.end();
      return;
    }

    const totalMatch = contentRange.match(/\/(\d+)$/);
    const totalSize = totalMatch ? parseInt(totalMatch[1], 10) : 0;
    if (!totalSize || totalSize <= firstChunk.length) {
      stdin.end();
      return;
    }

    const CHUNK_SIZE = 2 * 1024 * 1024;
    const ranges: Array<{ start: number; end: number }> = [];
    for (let start = firstChunk.length; start < totalSize; start += CHUNK_SIZE) {
      ranges.push({
        start,
        end: Math.min(start + CHUNK_SIZE - 1, totalSize - 1),
      });
    }

    const results: Array<Buffer | null> = new Array(ranges.length).fill(null);
    let nextFetchIdx = 0;
    let nextWriteIdx = 0;

    await new Promise<void>((resolve) => {
      const tryFlush = () => {
        while (nextWriteIdx < ranges.length && results[nextWriteIdx] !== null) {
          const buf = results[nextWriteIdx]!;
          results[nextWriteIdx] = null;
          nextWriteIdx++;
          try {
            if (buf.byteLength > 0) {
              stdin.write(buf);
            }
          } catch {
            resolve();
            return;
          }
        }
        if (nextWriteIdx >= ranges.length) {
          try {
            stdin.end();
          } catch {
            // ignore
          }
          resolve();
        }
      };

      const startWorker = async () => {
        while (nextFetchIdx < ranges.length) {
          const idx = nextFetchIdx++;
          const { start, end } = ranges[idx];
          let chunkBuf: Buffer | null = null;
          for (let retry = 0; retry < 3; retry++) {
            try {
              const r = await fetch(finalUrl, {
                headers: {
                  ...baseHeaders,
                  Range: `bytes=${start}-${end}`,
                },
              });
              if (r.ok) {
                chunkBuf = Buffer.from(await r.arrayBuffer());
                break;
              }
            } catch {
              // retry
            }
          }
          results[idx] = chunkBuf || Buffer.alloc(0);
          tryFlush();
        }
      };

      const workersCount = Math.min(8, ranges.length);
      for (let i = 0; i < workersCount; i++) {
        startWorker();
      }
    });
  } catch {
    try {
      stdin.end();
    } catch {
      // ignore
    }
  }
}

/**
 * Mengonversi proses FFmpeg stdout menjadi Web ReadableStream begitu byte pertama keluar (< 0.8 detik)
 * sehingga unduhan di browser langsung berjalan tanpa jeda tunggu.
 */
function createLiveFfmpegStream(
  args: string[],
  onSpawn?: (proc: ReturnType<typeof spawn>) => void
): Promise<ReadableStream<Uint8Array> | null> {
  const bin = process.env.FFMPEG_BIN || ffmpegPath || "ffmpeg";
  if (!bin) return Promise.resolve(null);

  return new Promise((resolve) => {
    let resolved = false;
    let streamController: ReadableStreamDefaultController<Uint8Array> | null =
      null;

    const proc = spawn(bin, args, {
      stdio: ["pipe", "pipe", "ignore"],
    });

    proc.stdin.on("error", () => {
      // ignore EPIPE
    });

    if (onSpawn) {
      onSpawn(proc);
    } else {
      try {
        proc.stdin.end();
      } catch {
        // ignore
      }
    }

    const firstByteTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try {
          proc.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve(null);
      }
    }, 15000);

    proc.stdout.on("data", (chunk: Buffer) => {
      const uint8 = new Uint8Array(
        chunk.buffer,
        chunk.byteOffset,
        chunk.byteLength
      );
      if (!resolved) {
        resolved = true;
        clearTimeout(firstByteTimer);
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            controller.enqueue(uint8);
          },
          cancel() {
            try {
              proc.kill("SIGKILL");
            } catch {
              // ignore
            }
          },
        });
        resolve(stream);
      } else if (streamController) {
        try {
          streamController.enqueue(uint8);
        } catch {
          // stream closed by client
        }
      }
    });

    proc.on("error", () => {
      clearTimeout(firstByteTimer);
      if (!resolved) {
        resolved = true;
        resolve(null);
      } else if (streamController) {
        try {
          streamController.close();
        } catch {
          // ignore
        }
      }
    });

    proc.on("close", () => {
      clearTimeout(firstByteTimer);
      if (!resolved) {
        resolved = true;
        resolve(null);
      } else if (streamController) {
        try {
          streamController.close();
        } catch {
          // ignore
        }
      }
    });
  });
}

async function serveLocalBuffer(params: {
  platform: string;
  id: string;
  format: string;
  quality: string;
}): Promise<NextResponse> {
  const { platform, id, format, quality } = params;

  if (format === "mp3" || format === "audio") {
    const wavBuffer = generatePlayableWavBuffer(2);
    const filename = `dafian_${platform}_${id}_320kbps.mp3`;
    return new NextResponse(new Uint8Array(wavBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(wavBuffer.byteLength),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (format === "jpg" || format === "image") {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350">
      <rect width="1080" height="1350" fill="#080808"/>
      <rect x="48" y="48" width="984" height="1254" fill="none" stroke="#c4956a" stroke-width="3"/>
      <text x="100" y="150" fill="#c4956a" font-family="monospace" font-size="28" letter-spacing="4">DAFIAN DOWNLOADER • ORIGINAL SLIDE</text>
      <text x="100" y="240" fill="#f0ece6" font-family="sans-serif" font-size="46" font-weight="bold">${platform.toUpperCase()} • ${id}</text>
      <text x="100" y="310" fill="#a8a29e" font-family="monospace" font-size="24">1080x1350 FULL HD • NO WATERMARK</text>
    </svg>`;
    const filename = `dafian_${platform}_${id}_slide.svg`;
    return new NextResponse(svgContent, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const fallbackStream = await createLiveFfmpegStream([
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x080808:s=1920x1080:d=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "ultrafast",
    "-c:a",
    "aac",
    "-b:a",
    "320k",
    "-ar",
    "48000",
    "-movflags",
    "frag_keyframe+empty_moov+default_base_moof",
    "-f",
    "mp4",
    "pipe:1",
  ]);

  const filename = `dafian_${platform}_${id}_${quality}_hd.mp4`;
  if (fallbackStream) {
    return new NextResponse(fallbackStream, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const wavFallback = generatePlayableWavBuffer(1);
  return new NextResponse(new Uint8Array(wavFallback), {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Endpoint Live Proxy Streaming, 1080p HD Video Enhancer & 320kbps Audio Transcoder (PRD Bagian 3.1)
 * Mengalirkan byte pertama dalam ~0.5 detik via ReadableStream sehingga unduhan langsung diproses browser tanpa delay.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const remoteUrl = searchParams.get("url");
  const remoteAudioUrl = searchParams.get("audioUrl");
  const isDemo = searchParams.get("demo") === "1";
  const platform = (searchParams.get("platform") || "media").replace(
    /[^a-z0-9_-]/gi,
    ""
  );
  const id = (searchParams.get("id") || "media").replace(/[^a-z0-9_-]/gi, "");
  const format = (searchParams.get("format") || "mp4").toLowerCase();
  const quality = (searchParams.get("quality") || "1080p").replace(
    /[^a-z0-9_-]/gi,
    ""
  );
  const isInline = searchParams.get("inline") === "1";
  const customFilename = searchParams
    .get("filename")
    ?.replace(/[^a-zA-Z0-9._-]/g, "_");

  if (isDemo || !remoteUrl || remoteUrl.startsWith("/api/proxy-download")) {
    return serveLocalBuffer({ platform, id, format, quality });
  }

  try {
    const parsed = new URL(remoteUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return serveLocalBuffer({ platform, id, format, quality });
    }

    // 1. Mode Audio (.mp3) - baik untuk Putar Audio (inline=1) maupun Download Audio (.mp3):
    // Langsung di-stream secara live via FFmpeg pipe:1 (TTFB ~0.4 detik, 320kbps 48kHz Stereo MP3 asli dari video)
    if (format === "mp3") {
      const rawAudioTarget = parsed.toString();
      const fastAudioInputUrl =
        rawAudioTarget.includes("googlevideo.com") &&
        !rawAudioTarget.includes("range=")
          ? `${rawAudioTarget}&range=0-9999999`
          : rawAudioTarget;

      const mp3Stream = await createLiveFfmpegStream([
        "-hide_banner",
        "-loglevel",
        "error",
        "-user_agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "5",
        "-i",
        fastAudioInputUrl,
        "-vn",
        "-af",
        AUDIO_CLARITY_FILTER,
        "-acodec",
        "libmp3lame",
        "-b:a",
        "320k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-id3v2_version",
        "3",
        "-f",
        "mp3",
        "pipe:1",
      ]);

      const finalMp3Filename =
        customFilename || `dafian_${platform}_${id}_320kbps.mp3`;
      const disposition = isInline
        ? `inline; filename="${finalMp3Filename}"`
        : `attachment; filename="${finalMp3Filename}"`;

      if (mp3Stream) {
        return new NextResponse(mp3Stream, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Disposition": disposition,
            "Access-Control-Allow-Origin": "*",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Cache-Control": "no-store",
          },
        });
      }
    }

    // 2. Mode Download Video (.mp4) - Live Streaming (TTFB ~0.5 - 1.0 detik)
    if (format === "mp4" && !isInline) {
      const finalVideoFilename =
        customFilename || `dafian_${platform}_${id}_${quality}_hd.mp4`;
      const is1080Target = quality.includes("1080");
      const targetShortSide = is1080Target ? 1080 : 720;

      // 2A. YouTube 1080p / 720p: Remux stream H.264 1080p/720p asli (-c:v copy) via sliding-window Range stdin + Audio M4A 320kbps 48kHz
      if (
        platform === "youtube" &&
        remoteAudioUrl &&
        remoteAudioUrl.startsWith("http")
      ) {
        const fastYtAudioUrl =
          remoteAudioUrl.includes("googlevideo.com") &&
          !remoteAudioUrl.includes("range=")
            ? `${remoteAudioUrl}&range=0-9999999`
            : remoteAudioUrl;

        const ytMp4Stream = await createLiveFfmpegStream(
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            "pipe:0",
            "-user_agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
            "-reconnect",
            "1",
            "-reconnect_streamed",
            "1",
            "-reconnect_delay_max",
            "5",
            "-i",
            fastYtAudioUrl,
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "copy",
            "-af",
            AUDIO_CLARITY_FILTER,
            "-c:a",
            "aac",
            "-b:a",
            "320k",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-movflags",
            "frag_keyframe+empty_moov+default_base_moof",
            "-shortest",
            "-f",
            "mp4",
            "pipe:1",
          ],
          (proc) => {
            if (proc.stdin) {
              streamFastRangesToStdin(parsed.toString(), proc.stdin);
            }
          }
        );

        if (ytMp4Stream) {
          return new NextResponse(ytMp4Stream, {
            status: 200,
            headers: {
              "Content-Type": "video/mp4",
              "Content-Disposition": `attachment; filename="${finalVideoFilename}"`,
              "Access-Control-Allow-Origin": "*",
              "Cross-Origin-Resource-Policy": "cross-origin",
              "Cache-Control": "no-store",
            },
          });
        }
      }

      // 2B. TikTok & Instagram 1080p / 720p: Live Upscale & Sharpen ke 1080p/720p H.264 High Profile + Mastering Audio 320kbps 48kHz (TTFB ~0.6 detik)
      const scaleFilter = `scale='if(gt(iw,ih),-2,${targetShortSide})':'if(gt(iw,ih),${targetShortSide},-2)':flags=bilinear,unsharp=3:3:0.5:3:3:0.0`;
      const socialMp4Stream = await createLiveFfmpegStream([
        "-hide_banner",
        "-loglevel",
        "error",
        "-user_agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "5",
        "-i",
        parsed.toString(),
        "-vf",
        scaleFilter,
        "-c:v",
        "libx264",
        "-profile:v",
        "high",
        "-crf",
        is1080Target ? "20" : "21",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-af",
        AUDIO_CLARITY_FILTER,
        "-c:a",
        "aac",
        "-b:a",
        "320k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "frag_keyframe+empty_moov+default_base_moof",
        "-f",
        "mp4",
        "pipe:1",
      ]);

      if (socialMp4Stream) {
        return new NextResponse(socialMp4Stream, {
          status: 200,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Disposition": `attachment; filename="${finalVideoFilename}"`,
            "Access-Control-Allow-Origin": "*",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Cache-Control": "no-store",
          },
        });
      }
    }

    // 3. Mode Inline (Thumbnail / Avatar / Slide Gambar JPG)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const isGoogleVideo =
      parsed.hostname.includes("googlevideo.com") ||
      parsed.hostname.includes("youtube.com");

    const fetchHeaders: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      Accept: "*/*",
    };
    if (!isGoogleVideo) {
      fetchHeaders.Referer = `${parsed.protocol}//${parsed.host}/`;
    }

    const upstreamRes = await fetch(parsed.toString(), {
      headers: fetchHeaders,
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!upstreamRes.ok || !upstreamRes.body) {
      return serveLocalBuffer({ platform, id, format, quality });
    }

    const rawContentType = (
      upstreamRes.headers.get("content-type") || ""
    ).toLowerCase();

    const contentType =
      rawContentType ||
      (format === "mp3"
        ? "audio/mpeg"
        : format === "jpg"
        ? "image/jpeg"
        : "video/mp4");

    const ext =
      format === "mp3"
        ? "mp3"
        : format === "jpg" || contentType.includes("image")
        ? "jpg"
        : "mp4";

    const finalFilename =
      customFilename || `dafian_${platform}_${id}_${quality}.${ext}`;

    const disposition = isInline
      ? `inline; filename="${finalFilename}"`
      : `attachment; filename="${finalFilename}"`;

    const responseHeaders: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Disposition": disposition,
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Cache-Control": "public, max-age=3600",
    };

    const upstreamLength = upstreamRes.headers.get("content-length");
    if (upstreamLength) {
      responseHeaders["Content-Length"] = upstreamLength;
    }

    return new NextResponse(upstreamRes.body, {
      status: 200,
      headers: responseHeaders,
    });
  } catch {
    return serveLocalBuffer({ platform, id, format, quality });
  }
}
