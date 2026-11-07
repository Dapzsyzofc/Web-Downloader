"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ServerAdminConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  engineMode: "auto" | "live_only" | "simulation_fallback";
  cacheTtlMinutes: number;
  enabledPlatforms: {
    instagram: boolean;
    tiktok: boolean;
    youtube: boolean;
  };
  renderWorkerUrl: string;
  lastRestartedAt: string;
}

interface ScraperSession {
  id: string;
  platform: "instagram" | "youtube" | "tiktok";
  account_label: string;
  session_cookie_masked: string;
  is_active: boolean;
  fail_count: number;
  use_count: number;
  last_used_at: string;
}

interface CacheItem {
  url_hash: string;
  platform: string;
  subtype: string;
  normalized_url: string;
  hit_count: number;
  expires_at: string;
}

interface LogItem {
  id: string;
  ip_hash?: string;
  url_hash: string;
  platform: string;
  content_type: string;
  cache_hit: boolean;
  latency_ms: number;
  provider_used: string;
  status: "ok" | "error";
  note?: string;
  created_at: string;
}

interface AdminSnapshot {
  connectedMode: string;
  renderWorkerConfigured: boolean;
  serverConfig: ServerAdminConfig;
  tables: {
    scraper_sessions: ScraperSession[];
    extraction_cache: CacheItem[];
    usage_logs: LogItem[];
  };
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [tab, setTab] = useState<"server" | "cookies" | "logs">("server");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // Form state untuk tambah sesi cookie baru
  const [newPlatform, setNewPlatform] = useState<
    "instagram" | "tiktok" | "youtube"
  >("instagram");
  const [newLabel, setNewLabel] = useState("");
  const [newCookie, setNewCookie] = useState("");
  const [newCsrf, setNewCsrf] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const fetchAdminData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/server", {
        cache: "no-store",
        credentials: "include",
      });
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        setSnapshot(json.data);
      }
    } catch {
      showToast("Gagal memuat data server");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

  const handleSaveConfig = async (patch: Partial<ServerAdminConfig>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/server", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const json = await res.json();
      if (json.success) {
        setSnapshot(json.data);
        showToast("Konfigurasi server tersimpan");
      }
    } catch {
      showToast("Gagal menyimpan perubahan");
    } finally {
      setSaving(false);
    }
  };

  const handleServerAction = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const json = await res.json();
      if (json.success) {
        setSnapshot(json.data);
        showToast(json.message || "Berhasil dijalankan");
      }
    } catch {
      showToast("Gagal menjalankan perintah");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/admin", {
      method: "DELETE",
      credentials: "include",
    });
    router.push("/admin/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 font-mono-tech text-xs text-white/45">
        <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-[#c4956a] animate-spin" />
        <span>Memuat panel kontrol server...</span>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 font-mono-tech text-xs text-[#ef4444]">
        <span>Gagal memuat status server.</span>
        <Link href="/admin/login" className="text-[#d4a87a] underline">
          Login Ulang
        </Link>
      </div>
    );
  }

  const cfg = snapshot.serverConfig;
  const activeSessionsCount = snapshot.tables.scraper_sessions.filter(
    (s) => s.is_active
  ).length;

  return (
    <div className="relative z-10 min-h-screen max-w-[920px] mx-auto px-4 sm:px-7 pb-16">
      {/* TOP BAR (Identik dengan Portofolio Dafian) */}
      <header className="flex flex-wrap items-center justify-between gap-3 py-6 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <h1 className="font-display text-xl text-[#c4956a] tracking-tight">
            Dafian Downloader
          </h1>
          <span className="font-mono-tech text-[10px] text-white/50 tracking-[0.12em] uppercase px-2 py-0.5 rounded-md border border-[#c4956a]/30 bg-[#c4956a]/10">
            server admin
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          {toast && (
            <span
              role="status"
              className="font-mono-tech text-xs text-[#4ade80]"
            >
              {toast}
            </span>
          )}
          <Link
            href="/"
            className="min-h-[38px] px-3.5 py-2 rounded-lg font-mono-tech text-[11px] text-[#d4a87a] bg-[#c4956a]/10 border border-[#c4956a]/30 hover:bg-[#c4956a]/20 hover:text-white flex items-center transition-colors"
          >
            Lihat Downloader
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="min-h-[38px] px-3.5 py-2 rounded-lg font-mono-tech text-[11px] text-white/50 border border-white/12 hover:text-[#ef4444] hover:border-[#ef4444]/40 cursor-pointer transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* RINGKASAN STATUS SERVER */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
        <div className="p-3.5 rounded-xl bg-[#121110]/90 border border-white/10">
          <span className="font-mono-tech text-[10px] text-white/45 uppercase block">
            Status Layanan
          </span>
          <span
            className={`font-mono-tech text-sm font-bold mt-1 block ${
              cfg.maintenanceMode ? "text-[#fbbf24]" : "text-[#4ade80]"
            }`}
          >
            {cfg.maintenanceMode ? "MAINTENANCE" : "ONLINE NORMAL"}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#121110]/90 border border-white/10">
          <span className="font-mono-tech text-[10px] text-white/45 uppercase block">
            Engine Mode
          </span>
          <span className="font-mono-tech text-sm font-bold text-[#d4a87a] mt-1 block uppercase">
            {cfg.engineMode}
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#121110]/90 border border-white/10">
          <span className="font-mono-tech text-[10px] text-white/45 uppercase block">
            Cookie Pool Aktif
          </span>
          <span className="font-mono-tech text-sm font-bold text-white mt-1 block">
            {activeSessionsCount} / {snapshot.tables.scraper_sessions.length} Akun
          </span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#121110]/90 border border-white/10">
          <span className="font-mono-tech text-[10px] text-white/45 uppercase block">
            Cache Tersimpan
          </span>
          <span className="font-mono-tech text-sm font-bold text-white mt-1 block">
            {snapshot.tables.extraction_cache.length} Link
          </span>
        </div>
      </div>

      {/* TABS */}
      <div className="py-2">
        <div
          role="tablist"
          aria-label="Menu Kontrol Admin"
          className="flex flex-col sm:flex-row gap-1 bg-white/5 p-1 rounded-xl border border-white/10"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "server"}
            onClick={() => setTab("server")}
            className={`flex-1 min-h-[42px] px-4 py-2.5 rounded-lg font-mono-tech text-xs cursor-pointer transition-all ${
              tab === "server"
                ? "bg-[#c4956a]/15 text-[#c4956a] border border-[#c4956a]/30"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            Kontrol &amp; Pemulihan Server
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "cookies"}
            onClick={() => setTab("cookies")}
            className={`flex-1 min-h-[42px] px-4 py-2.5 rounded-lg font-mono-tech text-xs cursor-pointer transition-all ${
              tab === "cookies"
                ? "bg-[#c4956a]/15 text-[#c4956a] border border-[#c4956a]/30"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            Cookie Pool ({snapshot.tables.scraper_sessions.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "logs"}
            onClick={() => setTab("logs")}
            className={`flex-1 min-h-[42px] px-4 py-2.5 rounded-lg font-mono-tech text-xs cursor-pointer transition-all ${
              tab === "logs"
                ? "bg-[#c4956a]/15 text-[#c4956a] border border-[#c4956a]/30"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            Cache &amp; Log Kendala ({snapshot.tables.usage_logs.length})
          </button>
        </div>
      </div>

      {/* PANEL 1: KONTROL & PEMULIHAN SERVER */}
      {tab === "server" && (
        <div className="space-y-4 mt-3">
          {/* Tindakan Cepat Saat Ada Kendala */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#121110]/90 border border-white/12 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-base text-white">
                  Tindakan Cepat Pemulihan Kendala
                </h2>
                <p className="text-xs text-white/50 mt-0.5">
                  Gunakan tombol di bawah jika ekstraksi macet, cache usang,
                  atau worker perlu di-reset.
                </p>
              </div>
              <span className="font-mono-tech text-[11px] text-white/40">
                Restart Terakhir:{" "}
                {new Date(cfg.lastRestartedAt).toLocaleTimeString("id-ID")}
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  handleServerAction({ action: "restart_worker" })
                }
                className="min-h-[42px] px-4 py-2.5 rounded-lg font-mono-tech text-xs bg-[#c4956a]/15 border border-[#c4956a]/40 text-[#d4a87a] hover:bg-[#c4956a]/25 hover:text-white cursor-pointer transition-colors"
              >
                Restart Worker &amp; Reset State
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => handleServerAction({ action: "flush_cache" })}
                className="min-h-[42px] px-4 py-2.5 rounded-lg font-mono-tech text-xs bg-white/5 border border-white/15 text-white/80 hover:border-white/35 hover:text-white cursor-pointer transition-colors"
              >
                Bersihkan Cache Link ({snapshot.tables.extraction_cache.length})
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  handleSaveConfig({
                    maintenanceMode: !cfg.maintenanceMode,
                  })
                }
                className={`min-h-[42px] px-4 py-2.5 rounded-lg font-mono-tech text-xs border cursor-pointer transition-colors ${
                  cfg.maintenanceMode
                    ? "bg-[#4ade80]/15 border-[#4ade80]/40 text-[#4ade80]"
                    : "bg-[#ef4444]/10 border-[#ef4444]/30 text-[#f87171]"
                }`}
              >
                {cfg.maintenanceMode
                  ? "Matikan Mode Maintenance (Buka Akses)"
                  : "Aktifkan Mode Maintenance"}
              </button>
            </div>
          </div>

          {/* Pengaturan Engine & Sakelar Platform */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#121110]/90 border border-white/12 space-y-5">
            <h2 className="font-display text-base text-white">
              Pengaturan Mesin Ekstraktor &amp; Modul Platform
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="engine-mode"
                  className="block font-mono-tech text-[11px] text-white/45 uppercase tracking-wider"
                >
                  Mode Mesin Ekstraktor
                </label>
                <select
                  id="engine-mode"
                  value={cfg.engineMode}
                  onChange={(e) =>
                    handleSaveConfig({
                      engineMode: e.target.value as ServerAdminConfig["engineMode"],
                    })
                  }
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-lg bg-[#1A1816] border border-white/15 text-white font-mono-tech text-xs outline-none focus:border-[#c4956a]"
                >
                  <option value="auto">
                    Auto (Live Scraper / yt-dlp + Fallback Aman)
                  </option>
                  <option value="live_only">Live Scraper Only</option>
                  <option value="simulation_fallback">
                    Mode Fallback (Paksa Simulasi Saat Gangguan)
                  </option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="cache-ttl"
                  className="block font-mono-tech text-[11px] text-white/45 uppercase tracking-wider"
                >
                  Durasi Cache Link (Menit)
                </label>
                <input
                  id="cache-ttl"
                  type="number"
                  min={1}
                  max={180}
                  value={cfg.cacheTtlMinutes}
                  onChange={(e) =>
                    handleSaveConfig({
                      cacheTtlMinutes: Number(e.target.value) || 30,
                    })
                  }
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-lg bg-white/5 border border-white/15 text-white font-mono-tech text-xs outline-none focus:border-[#c4956a]"
                />
              </div>
            </div>

            {/* Sakelar Aktif/Nonaktif per Platform */}
            <div className="space-y-2">
              <span className="block font-mono-tech text-[11px] text-white/45 uppercase tracking-wider">
                Status Modul Platform (Matikan jika salah satu platform sedang
                gangguan)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(["instagram", "tiktok", "youtube"] as const).map((plat) => {
                  const isOn = cfg.enabledPlatforms[plat];
                  return (
                    <button
                      key={plat}
                      type="button"
                      onClick={() =>
                        handleSaveConfig({
                          enabledPlatforms: {
                            ...cfg.enabledPlatforms,
                            [plat]: !isOn,
                          },
                        })
                      }
                      className={`min-h-[46px] p-3 rounded-xl border flex items-center justify-between font-mono-tech text-xs cursor-pointer transition-all ${
                        isOn
                          ? "bg-white/5 border-[#c4956a]/40 text-white"
                          : "bg-black/40 border-white/10 text-white/40"
                      }`}
                    >
                      <span className="uppercase font-bold">{plat}</span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          isOn
                            ? "bg-[#4ade80]/20 text-[#4ade80]"
                            : "bg-[#ef4444]/20 text-[#f87171]"
                        }`}
                      >
                        {isOn ? "AKTIF" : "NONAKTIF"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Pesan Maintenance */}
            <div className="space-y-1.5">
              <label
                htmlFor="maint-msg"
                className="block font-mono-tech text-[11px] text-white/45 uppercase tracking-wider"
              >
                Pesan Saat Mode Maintenance Aktif
              </label>
              <input
                id="maint-msg"
                type="text"
                value={cfg.maintenanceMessage}
                onChange={(e) =>
                  setSnapshot({
                    ...snapshot,
                    serverConfig: {
                      ...cfg,
                      maintenanceMessage: e.target.value,
                    },
                  })
                }
                onBlur={() =>
                  handleSaveConfig({
                    maintenanceMessage: cfg.maintenanceMessage,
                  })
                }
                className="w-full min-h-[42px] px-3.5 py-2 rounded-lg bg-white/5 border border-white/15 text-white font-mono-tech text-xs outline-none focus:border-[#c4956a]"
              />
            </div>
          </div>
        </div>
      )}

      {/* PANEL 2: COOKIE POOL SCRAPER */}
      {tab === "cookies" && (
        <div className="space-y-4 mt-3">
          {/* Tambah Sesi Cookie Baru */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newCookie.trim()) return;
              handleServerAction({
                action: "add_session",
                platform: newPlatform,
                account_label: newLabel,
                session_cookie: newCookie,
                csrf_token: newCsrf,
              });
              setNewLabel("");
              setNewCookie("");
              setNewCsrf("");
            }}
            className="p-5 sm:p-6 rounded-2xl bg-[#121110]/90 border border-white/12 space-y-4"
          >
            <h2 className="font-display text-base text-white">
              Tambah Sesi Akun Pekerja (Cookie Pool)
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-mono-tech text-[10px] text-white/45 uppercase mb-1">
                  Platform
                </label>
                <select
                  value={newPlatform}
                  onChange={(e) =>
                    setNewPlatform(
                      e.target.value as "instagram" | "tiktok" | "youtube"
                    )
                  }
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-[#1A1816] border border-white/15 text-white font-mono-tech text-xs"
                >
                  <option value="instagram">Instagram</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube</option>
                </select>
              </div>
              <div>
                <label className="block font-mono-tech text-[10px] text-white/45 uppercase mb-1">
                  Label Akun Worker
                </label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="ig_worker_node_04"
                  required
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white font-mono-tech text-xs"
                />
              </div>
              <div>
                <label className="block font-mono-tech text-[10px] text-white/45 uppercase mb-1">
                  Session Cookie (sessionid / ttwid)
                </label>
                <input
                  type="text"
                  value={newCookie}
                  onChange={(e) => setNewCookie(e.target.value)}
                  placeholder="sessionid=..."
                  required
                  className="w-full min-h-[40px] px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white font-mono-tech text-xs"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[40px] px-4 py-2 rounded-lg font-mono-tech text-xs bg-[#c4956a]/15 border border-[#c4956a]/40 text-[#d4a87a] hover:bg-[#c4956a]/25 hover:text-white cursor-pointer"
            >
              Simpan Sesi ke Pool
            </button>
          </form>

          {/* Daftar Sesi Cookie */}
          <div className="p-5 sm:p-6 rounded-2xl bg-[#121110]/90 border border-white/12 space-y-3">
            <h2 className="font-display text-base text-white">
              Daftar Sesi Worker Aktif (Round-Robin)
            </h2>
            <div className="space-y-2.5">
              {snapshot.tables.scraper_sessions.map((sess) => (
                <div
                  key={sess.id}
                  className="p-3.5 rounded-xl bg-white/4 border border-white/10 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-tech text-xs font-bold text-[#d4a87a] uppercase">
                        [{sess.platform}]
                      </span>
                      <span className="font-mono-tech text-xs font-bold text-white">
                        {sess.account_label}
                      </span>
                      <span
                        className={`font-mono-tech text-[10px] px-2 py-0.5 rounded-md ${
                          sess.is_active
                            ? "bg-[#4ade80]/15 text-[#4ade80]"
                            : "bg-white/10 text-white/45"
                        }`}
                      >
                        {sess.is_active ? "ACTIVE" : "PAUSED"}
                      </span>
                    </div>
                    <p className="font-mono-tech text-[11px] text-white/45 mt-1">
                      {sess.session_cookie_masked} • Digunakan {sess.use_count}x • Fail: {sess.fail_count}/3
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleServerAction({
                          action: "toggle_session",
                          id: sess.id,
                        })
                      }
                      className="min-h-[36px] px-3 py-1.5 rounded-lg font-mono-tech text-[11px] border border-white/15 bg-white/5 text-white/80 hover:text-white cursor-pointer"
                    >
                      {sess.is_active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleServerAction({
                          action: "delete_session",
                          id: sess.id,
                        })
                      }
                      className="min-h-[36px] px-3 py-1.5 rounded-lg font-mono-tech text-[11px] border border-[#ef4444]/30 bg-[#ef4444]/10 text-[#f87171] hover:text-[#ef4444] cursor-pointer"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PANEL 3: CACHE & LOG KENDALA */}
      {tab === "logs" && (
        <div className="space-y-4 mt-3">
          <div className="p-5 sm:p-6 rounded-2xl bg-[#121110]/90 border border-white/12 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base text-white">
                Log Permintaan &amp; Diagnostik Server
              </h2>
              <button
                type="button"
                onClick={() => handleServerAction({ action: "clear_logs" })}
                className="min-h-[36px] px-3 py-1.5 rounded-lg font-mono-tech text-[11px] border border-white/15 bg-white/5 text-white/70 hover:text-white cursor-pointer"
              >
                Bersihkan Log
              </button>
            </div>

            {snapshot.tables.usage_logs.length > 0 ? (
              <div className="space-y-2">
                {snapshot.tables.usage_logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-lg bg-white/4 border border-white/8 flex flex-wrap items-center justify-between gap-2 font-mono-tech text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[#d4a87a] font-bold uppercase">
                        [{log.platform}]
                      </span>
                      <span className="text-white/80">{log.content_type}</span>
                      <span className="text-white/45">({log.provider_used})</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-white/50">
                      <span>{log.cache_hit ? "CACHE HIT" : "SCRAPE"}</span>
                      <span className="text-[#4ade80]">{log.latency_ms} ms</span>
                      <span>
                        {new Date(log.created_at).toLocaleTimeString("id-ID")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="font-mono-tech text-xs text-white/40 py-4 text-center">
                Belum ada catatan log.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

