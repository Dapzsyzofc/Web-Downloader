"use client";

import React, { useState } from "react";
import Link from "next/link";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      });

      const data = await res.json();

      if (data.success) {
        window.location.href = "/admin";
        return;
      } else {
        setError(data.error || "Username atau password salah");
      }
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 relative z-10">
      <div className="w-full max-w-[390px] rounded-[20px] p-8 sm:p-9 bg-[#121110]/90 border border-white/10 shadow-[0_25px_60px_-20px_rgba(0,0,0,0.85)]">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl text-[#c4956a] tracking-tight">
            Dafian
          </h1>
          <p className="font-mono-tech text-[11px] text-white/45 mt-1.5 tracking-[0.12em] uppercase">
            Server Control Panel
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label
              htmlFor="admin-user"
              className="block font-mono-tech text-[11px] text-white/45 tracking-[0.08em] uppercase"
            >
              Username
            </label>
            <input
              id="admin-user"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="dafian"
              required
              autoComplete="username"
              className="w-full min-h-[44px] px-4 py-3 rounded-[10px] border border-white/15 bg-white/5 text-white font-mono-tech text-sm focus:border-[#c4956a] outline-none transition-colors"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="admin-pass"
              className="block font-mono-tech text-[11px] text-white/45 tracking-[0.08em] uppercase"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="admin-pass"
                type={showPass ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan password"
                required
                autoComplete="current-password"
                className="w-full min-h-[44px] pl-4 pr-16 py-3 rounded-[10px] border border-white/15 bg-white/5 text-white font-mono-tech text-sm focus:border-[#c4956a] outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPass((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-white/8 border border-white/15 text-white/70 font-mono-tech text-[11px] cursor-pointer"
              >
                {showPass ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="text-[#ef4444] font-mono-tech text-xs text-center"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[46px] py-3 rounded-[10px] bg-[#c4956a]/20 hover:bg-[#c4956a]/30 border border-[#c4956a]/45 text-[#d4a87a] hover:text-white font-mono-tech text-xs tracking-wider uppercase font-semibold transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? "Memverifikasi..." : "Masuk ke Panel Server"}
          </button>

          <div className="pt-2 flex items-center justify-between gap-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                setUsername("dafian");
                setPassword("SyzersSlixs080722");
              }}
              className="font-mono-tech text-[11px] text-white/45 hover:text-[#d4a87a] cursor-pointer"
            >
              Isi Otomatis Admin
            </button>

            <Link
              href="/"
              className="font-mono-tech text-[11px] text-[#d4a87a] hover:underline"
            >
              Kembali ke Downloader
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

