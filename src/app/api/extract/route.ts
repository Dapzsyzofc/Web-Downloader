import { NextRequest, NextResponse } from "next/server";
import { extractSocialMedia } from "@/lib/scrapers";
import {
  PlatformName,
  checkRateLimit,
  clearSupabaseExtractionCache,
  getSupabaseTelemetrySnapshot,
  hashVisitorIp,
} from "@/lib/supabase";

export async function GET() {
  const telemetry = getSupabaseTelemetrySnapshot();
  return NextResponse.json(
    {
      status: true,
      telemetry,
    },
    { status: 200 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const rawIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "127.0.0.1";
    const ipHash = hashVisitorIp(rawIp);

    const rate = checkRateLimit(ipHash);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          status: false,
          error:
            "Batas permintaan per menit tercapai. Tunggu beberapa detik sebelum mengekstrak tautan berikutnya.",
        },
        { status: 429 }
      );
    }

    const body = (await req.json()) as {
      url?: string;
      expectedPlatform?: PlatformName;
    };
    const rawUrl = body?.url?.trim() || "";
    const expectedPlatform = body?.expectedPlatform;

    if (!rawUrl) {
      return NextResponse.json(
        {
          status: false,
          error: "Kotak tautan masih kosong. Tempel tautan terlebih dahulu.",
        },
        { status: 400 }
      );
    }

    const result = await extractSocialMedia(rawUrl, ipHash, expectedPlatform);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Gagal memproses tautan. Periksa kembali format URL.";
    return NextResponse.json(
      {
        status: false,
        error: message,
      },
      { status: 422 }
    );
  }
}

export async function DELETE() {
  const clearedEntries = clearSupabaseExtractionCache();
  const telemetry = getSupabaseTelemetrySnapshot();
  return NextResponse.json(
    {
      status: true,
      clearedEntries,
      message: `Tabel extraction_cache dibersihkan (${clearedEntries} baris dihapus).`,
      telemetry,
    },
    { status: 200 }
  );
}
