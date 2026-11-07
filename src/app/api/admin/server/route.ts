import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_SESSION_TOKEN,
  addScraperSession,
  clearSupabaseExtractionCache,
  clearUsageLogs,
  deleteScraperSession,
  getSupabaseTelemetrySnapshot,
  restartWorkerState,
  ServerAdminConfig,
  toggleScraperSessionStatus,
  updateServerAdminConfig,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function isAuthorized(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get("admin_token")?.value === ADMIN_SESSION_TOKEN;
}

export async function GET() {
  if (!(await isAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    data: getSupabaseTelemetrySnapshot(),
  });
}

export async function PUT(req: NextRequest) {
  if (!(await isAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as Partial<ServerAdminConfig>;
    updateServerAdminConfig(body);
    return NextResponse.json({
      success: true,
      data: getSupabaseTelemetrySnapshot(),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Gagal memperbarui konfigurasi server" },
      { status: 400 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as {
      action: string;
      id?: string;
      platform?: "instagram" | "tiktok" | "youtube";
      account_label?: string;
      session_cookie?: string;
      csrf_token?: string;
    };

    if (body.action === "restart_worker") {
      restartWorkerState();
      return NextResponse.json({
        success: true,
        message: "Worker di-restart & cache berhasil di-reset",
        data: getSupabaseTelemetrySnapshot(),
      });
    }

    if (body.action === "flush_cache") {
      const count = clearSupabaseExtractionCache();
      return NextResponse.json({
        success: true,
        message: `Cache dibersihkan (${count} item dihapus)`,
        data: getSupabaseTelemetrySnapshot(),
      });
    }

    if (body.action === "clear_logs") {
      const count = clearUsageLogs();
      return NextResponse.json({
        success: true,
        message: `Log dibersihkan (${count} baris dihapus)`,
        data: getSupabaseTelemetrySnapshot(),
      });
    }

    if (body.action === "toggle_session" && body.id) {
      toggleScraperSessionStatus(body.id);
      return NextResponse.json({
        success: true,
        message: "Status sesi diperbarui",
        data: getSupabaseTelemetrySnapshot(),
      });
    }

    if (body.action === "delete_session" && body.id) {
      deleteScraperSession(body.id);
      return NextResponse.json({
        success: true,
        message: "Sesi dihapus dari Cookie Pool",
        data: getSupabaseTelemetrySnapshot(),
      });
    }

    if (body.action === "add_session" && body.session_cookie) {
      addScraperSession({
        platform: body.platform || "instagram",
        account_label: body.account_label || "worker_baru",
        session_cookie: body.session_cookie,
      });
      return NextResponse.json({
        success: true,
        message: "Sesi baru ditambahkan ke Cookie Pool",
        data: getSupabaseTelemetrySnapshot(),
      });
    }

    return NextResponse.json(
      { success: false, error: "Aksi tidak dikenali" },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Gagal menjalankan perintah admin" },
      { status: 400 }
    );
  }
}

