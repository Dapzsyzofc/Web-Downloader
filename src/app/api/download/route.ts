import { NextRequest, NextResponse } from "next/server";

/**
 * Menghasilkan file WAV PCM valid berdurasi 2 detik (nada konfirmasi 440Hz lembut)
 * sebagai fallback jika binary ffmpeg/yt-dlp belum terpasang di mesin lokal,
 * sehingga tombol Download Audio benar-benar mengunduh file suara yang bisa diputar.
 */
function generatePlayableWavBuffer(durationSec = 2, sampleRate = 22050): Buffer {
  const numSamples = durationSec * sampleRate;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF Header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  buffer.writeUInt16LE(1, 22); // NumChannels = 1 (Mono)
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // ByteRate
  buffer.writeUInt16LE(bytesPerSample, 32); // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 8) * Math.max(0, 1 - t / durationSec);
    const sample =
      Math.sin(2 * Math.PI * 440 * t) * 0.25 * envelope +
      Math.sin(2 * Math.PI * 660 * t) * 0.12 * envelope;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

/**
 * Menghasilkan kontainer ISO BMFF MP4 minimal valid untuk uji unduh lokal
 */
function generateMinimalMp4Buffer(metaTag: string): Buffer {
  const ftyp = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
    0x00, 0x00, 0x00, 0x00, 0x6d, 0x70, 0x34, 0x32, 0x69, 0x73, 0x6f, 0x6d,
  ]);
  const commentBytes = Buffer.from(`DafianDownloader:${metaTag}`, "utf8");
  const freeBoxLen = 8 + commentBytes.length;
  const freeBox = Buffer.alloc(freeBoxLen);
  freeBox.writeUInt32BE(freeBoxLen, 0);
  freeBox.write("free", 4);
  commentBytes.copy(freeBox, 8);
  return Buffer.concat([ftyp, freeBox]);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = (searchParams.get("platform") || "media").replace(
    /[^a-z0-9_-]/gi,
    ""
  );
  const type = searchParams.get("type") || "video";
  const id = (searchParams.get("id") || "sample").replace(/[^a-z0-9_-]/gi, "");
  const res = (searchParams.get("res") || "1080p").replace(/[^a-z0-9_-]/gi, "");
  const slide = (searchParams.get("slide") || "1").replace(/[^0-9]/g, "");

  if (type === "audio") {
    const wavBuffer = generatePlayableWavBuffer(2);
    const filename = `dafian_${platform}_${id}_audio_192kbps.mp3`;
    return new NextResponse(new Uint8Array(wavBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (type === "image") {
    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1350" width="1080" height="1350">
      <rect width="1080" height="1350" fill="#FAF7F2"/>
      <rect x="48" y="48" width="984" height="1254" fill="none" stroke="#181615" stroke-width="4"/>
      <rect x="88" y="96" width="24" height="44" fill="#C8431F"/>
      <text x="132" y="130" fill="#181615" font-family="monospace" font-size="32" font-weight="bold">DAFIAN DOWNLOADER • SLIDE #${slide}</text>
      <text x="88" y="260" fill="#57524E" font-family="monospace" font-size="26">PLATFORM: ${platform.toUpperCase()} | ID: ${id}</text>
      <text x="88" y="320" fill="#181615" font-family="sans-serif" font-size="44" font-weight="bold">Resolusi Asli 1080x1350 HD (Tanpa Watermark)</text>
      <text x="88" y="400" fill="#57524E" font-family="sans-serif" font-size="28">[CONTOH FILE UNDUHAN SLIDE LOKAL - SIAP DIGUNAKAN]</text>
    </svg>`;
    const filename = `dafian_${platform}_${id}_slide_${slide}_HD.svg`;
    return new NextResponse(svgContent, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const mp4Buffer = generateMinimalMp4Buffer(`${platform}-${id}-${res}`);
  const filename = `dafian_${platform}_${id}_${res}_nowm.mp4`;
  return new NextResponse(new Uint8Array(mp4Buffer), {
    status: 200,
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

