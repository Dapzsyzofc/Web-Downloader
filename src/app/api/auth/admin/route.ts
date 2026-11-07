import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_TOKEN } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const VALID_USERNAMES = ["dafian", "dapzsyz", "admin"];
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "SyzersSlixs080722";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "").trim();

    const valid =
      VALID_USERNAMES.includes(username) &&
      password.toLowerCase() === ADMIN_PASSWORD.toLowerCase();

    if (valid) {
      const cookieStore = await cookies();
      cookieStore.set("admin_token", ADMIN_SESSION_TOKEN, {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
        path: "/",
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "Username atau password salah" },
      { status: 401 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Permintaan tidak valid" },
      { status: 400 }
    );
  }
}

export async function GET() {
  const cookieStore = await cookies();
  const authenticated =
    cookieStore.get("admin_token")?.value === ADMIN_SESSION_TOKEN;
  return NextResponse.json({ authenticated });
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("admin_token");
  return NextResponse.json({ success: true });
}

