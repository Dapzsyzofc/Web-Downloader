"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import {
  detectSocialUrl,
  SAMPLE_TEST_LINKS,
  toProxyDownloadUrl,
  UnifiedExtractionResult,
  WorkspacePlatform,
} from "@/lib/url-detector";

interface PlatformConfig {
  id: WorkspacePlatform;
  name: string;
  color: string;
  subtitle: string;
  placeholder: string;
  domainHint: string;
  inputLabel: string;
}

const PLATFORMS: Record<WorkspacePlatform, PlatformConfig> = {
  instagram: {
    id: "instagram",
    name: "Instagram",
    color: "#E1306C",
    subtitle: "Unduh Reels, video, foto slide, MP3, dan salin komentar.",
    placeholder: "Tempel khusus link Instagram (instagram.com/reel/... atau /p/...)...",
    domainHint: "instagram.com / instagr.am",
    inputLabel: "Input Khusus Link Instagram",
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    color: "#FE2C55",
    subtitle: "Unduh video HD tanpa watermark, slide foto, dan musik MP3.",
    placeholder: "Tempel khusus link TikTok (tiktok.com / vt.tiktok.com)...",
    domainHint: "tiktok.com / vt.tiktok.com",
    inputLabel: "Input Khusus Link TikTok",
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    color: "#FF0000",
    subtitle: "Unduh video Full HD 1080p, Shorts, dan ekstrak audio MP3.",
    placeholder: "Tempel khusus link YouTube (youtube.com / youtu.be)...",
    domainHint: "youtube.com / youtu.be",
    inputLabel: "Input Khusus Link YouTube",
  },
};

function PlatformIcon({
  platform,
  className = "w-4 h-4",
}: {
  platform: WorkspacePlatform;
  className?: string;
}) {
  if (platform === "instagram") {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    );
  }

  if (platform === "tiktok") {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export default function DafianDownloaderPage() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activePlatform, setActivePlatform] =
    useState<WorkspacePlatform>("instagram");

  // State input terpisah untuk masing-masing platform
  const [inputUrls, setInputUrls] = useState<Record<WorkspacePlatform, string>>({
    instagram: "",
    tiktok: "",
    youtube: "",
  });

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [result, setResult] = useState<UnifiedExtractionResult | null>(null);
  const [copiedComment, setCopiedComment] = useState<boolean>(false);
  const [activeSlideIdx, setActiveSlideIdx] = useState<number>(0);
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const inputUrl = inputUrls[activePlatform];

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("dafian_dl_theme") as
      | "dark"
      | "light"
      | null;
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      document.documentElement.classList.toggle("light", savedTheme === "light");
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("light", next === "light");
    window.localStorage.setItem("dafian_dl_theme", next);
  };

  const stopAudioPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsPlayingAudio(false);
  }, []);

  const setCurrentPlatformUrl = useCallback(
    (val: string, plat: WorkspacePlatform = activePlatform) => {
      setInputUrls((prev) => ({
        ...prev,
        [plat]: val,
      }));
    },
    [activePlatform]
  );

  // Validasi apakah link sesuai dengan aplikasi sosmed yang sedang aktif
  const urlValidation = useMemo(() => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      return {
        state: "empty" as const,
        message: "",
      };
    }

    const detected = detectSocialUrl(trimmed);
    const currentName = PLATFORMS[activePlatform].name;

    if (!detected.isValid || detected.platform === "unknown") {
      return {
        state: "invalid" as const,
        message: `Format link tidak sesuai dengan ${currentName}. Gunakan link resmi ${PLATFORMS[activePlatform].domainHint}.`,
      };
    }

    if (detected.platform !== activePlatform) {
      const otherName = PLATFORMS[detected.platform].name;
      return {
        state: "mismatch" as const,
        message: `Link tidak sesuai! Ini adalah link ${otherName}, sedangkan Anda sedang di menu ${currentName}. Hapus link ini dan tempelkan link khusus ${currentName}.`,
      };
    }

    return {
      state: "valid" as const,
      message: `Link ${currentName} sesuai (${detected.label})`,
    };
  }, [inputUrl, activePlatform]);

  // Setiap pindah halaman/tab platform, link yang tertempel otomatis terhapus
  const handleSelectPlatform = (target: WorkspacePlatform) => {
    if (target === activePlatform) return;

    stopAudioPreview();
    setInputUrls({
      instagram: "",
      tiktok: "",
      youtube: "",
    });
    setActivePlatform(target);
    setStatus("idle");
    setErrorMessage("");
    setResult(null);
    setCopiedComment(false);
    setActiveSlideIdx(0);
  };

  // Tidak pernah berpindah tab otomatis saat menempel link; wajib sesuai platform aktif
  const handleInputChange = (rawVal: string) => {
    setCurrentPlatformUrl(rawVal, activePlatform);

    const trimmed = rawVal.trim();
    if (!trimmed) {
      setStatus("idle");
      setErrorMessage("");
      setResult(null);
      return;
    }

    const detected = detectSocialUrl(trimmed);
    const currentName = PLATFORMS[activePlatform].name;

    if (detected.platform !== "unknown" && detected.platform !== activePlatform) {
      const otherName = PLATFORMS[detected.platform].name;
      setStatus("error");
      setResult(null);
      setErrorMessage(
        `Link tidak sesuai! Anda sedang berada di downloader ${currentName}, tetapi menempelkan link ${otherName}. Harap tempelkan link khusus ${currentName}.`
      );
    } else if (!detected.isValid) {
      setStatus("error");
      setResult(null);
      setErrorMessage(
        `Link tidak dikenali untuk ${currentName}. Pastikan link berasal dari ${PLATFORMS[activePlatform].domainHint}.`
      );
    } else if (status === "error") {
      setStatus("idle");
      setErrorMessage("");
    }
  };

  const handleClearCurrentLink = () => {
    stopAudioPreview();
    setCurrentPlatformUrl("", activePlatform);
    setStatus("idle");
    setErrorMessage("");
    setResult(null);
    setCopiedComment(false);
    setActiveSlideIdx(0);
  };

  const processUrl = useCallback(
    async (targetUrl: string, currentPlat: WorkspacePlatform) => {
      const trimmed = targetUrl.trim();
      stopAudioPreview();

      if (!trimmed) {
        setStatus("error");
        setErrorMessage(
          `Tempelkan link ${PLATFORMS[currentPlat].name} terlebih dahulu.`
        );
        return;
      }

      // Pastikan link sesuai dengan aplikasi sosmed yang dipilih (tidak boleh pindah otomatis)
      const preCheck = detectSocialUrl(trimmed);
      const currentName = PLATFORMS[currentPlat].name;

      if (!preCheck.isValid || preCheck.platform === "unknown") {
        setStatus("error");
        setResult(null);
        setErrorMessage(
          `Format link tidak valid untuk ${currentName}. Gunakan link resmi ${PLATFORMS[currentPlat].domainHint}.`
        );
        return;
      }

      if (preCheck.platform !== currentPlat) {
        const otherName = PLATFORMS[preCheck.platform].name;
        setStatus("error");
        setResult(null);
        setErrorMessage(
          `Link tidak sesuai! Anda sedang berada di downloader ${currentName}, namun menempelkan link ${otherName}. Harap gunakan link khusus ${currentName}.`
        );
        return;
      }

      setStatus("loading");
      setErrorMessage("");
      setCopiedComment(false);
      setActiveSlideIdx(0);

      try {
        const response = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: trimmed,
            expectedPlatform: currentPlat,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.status) {
          setStatus("error");
          setErrorMessage(
            data.error ||
              `Link tidak sesuai dengan ${currentName}. Pastikan link berasal dari ${PLATFORMS[currentPlat].domainHint}.`
          );
          return;
        }

        const extracted = data as UnifiedExtractionResult;
        setResult(extracted);
        setStatus("success");
      } catch {
        setStatus("error");
        setErrorMessage("Gagal memproses link. Coba lagi.");
      }
    },
    [stopAudioPreview]
  );

  // Dukungan Share Link otomatis (?url=... atau ?text=...) jika sesuai platform aktif
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get("url") || params.get("text");
    if (sharedUrl) {
      setCurrentPlatformUrl(sharedUrl, activePlatform);
      processUrl(sharedUrl, activePlatform);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOneTapPaste = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          const cleanClip = clipText.trim();
          setCurrentPlatformUrl(cleanClip, activePlatform);
          await processUrl(cleanClip, activePlatform);
          return;
        }
      }
    } catch {
      // Fokus ke input jika izin clipboard belum diberikan
    }
    const inputEl = document.getElementById(`url-input-${activePlatform}`);
    inputEl?.focus();
  };

  const handleCopyComment = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(40);
      } catch {
        // Abaikan
      }
    }
    setCopiedComment(true);
    setTimeout(() => setCopiedComment(false), 3000);
  };

  const handleTriggerDownload = (id: string, downloadUrl: string) => {
    setActiveDownloadId(id);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.setAttribute("download", "");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      setActiveDownloadId((prev) => (prev === id ? null : prev));
    }, 1500);
  };

  /**
   * Unduh Audio MP3 yang dikonversi secara otomatis sesuai tautan video/musik asli
   */
  const handleAudioDownload = async (resData: UnifiedExtractionResult) => {
    const shortcode = resData.meta?.shortcode || "media";
    const proxyAudioUrl = toProxyDownloadUrl({
      rawUrl: resData.media.audioMp3Url || resData.media.videoHdUrl,
      platform: resData.platform,
      format: "mp3",
      quality: "320kbps",
      id: shortcode,
    });
    handleTriggerDownload("audio-mp3", proxyAudioUrl);
  };

  const handleToggleAudioPreview = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
      setIsPlayingAudio(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlayingAudio(true))
        .catch(() => setIsPlayingAudio(false));
    }
  };

  const currentMeta = PLATFORMS[activePlatform];
  const currentSamples = useMemo(
    () => SAMPLE_TEST_LINKS.filter((item) => item.platform === activePlatform),
    [activePlatform]
  );

  const shortcodeId = result?.meta?.shortcode || "media";
  const hdDownloadUrl = result
    ? toProxyDownloadUrl({
        rawUrl: result.media.videoHdUrl,
        audioUrl: result.media.audioMp3Url,
        platform: result.platform,
        format: "mp4",
        quality: "1080p",
        id: shortcodeId,
      })
    : "";
  const sdDownloadUrl = result
    ? toProxyDownloadUrl({
        rawUrl: result.media.videoSdUrl || result.media.videoHdUrl,
        audioUrl: result.media.audioMp3Url,
        platform: result.platform,
        format: "mp4",
        quality: "720p",
        id: shortcodeId,
      })
    : "";
  const audioPreviewUrl = result
    ? toProxyDownloadUrl({
        rawUrl: result.media.audioMp3Url || result.media.videoHdUrl,
        platform: result.platform,
        format: "mp3",
        quality: "320kbps",
        id: shortcodeId,
        inline: true,
      })
    : "";
  const avatarDisplayUrl = result
    ? toProxyDownloadUrl({
        rawUrl: result.author.avatar,
        platform: result.platform,
        format: "jpg",
        id: `${shortcodeId}_avatar`,
        inline: true,
      })
    : "";
  const commentAvatarDisplayUrl = result?.comment
    ? toProxyDownloadUrl({
        rawUrl: result.comment.avatar || result.author.avatar,
        platform: result.platform,
        format: "jpg",
        id: `${shortcodeId}_comment_avatar`,
        inline: true,
      })
    : avatarDisplayUrl;
  const thumbnailDisplayUrl = result
    ? toProxyDownloadUrl({
        rawUrl: result.media.thumbnail,
        platform: result.platform,
        format: "jpg",
        id: `${shortcodeId}_thumb`,
        inline: true,
      })
    : "";

  return (
    <div className="relative z-10 min-h-screen flex flex-col">
      {/* HEADER BAR (Dafian Portfolio Style) */}
      <header className="w-full max-w-4xl mx-auto px-4 sm:px-6 pt-5 pb-3 flex items-center justify-between gap-3">
        <a
          href="#downloader"
          className="min-h-[44px] inline-flex items-center font-display text-2xl text-[var(--bronze)] tracking-tight"
        >
          Dafian Downloader
        </a>

        {/* FLOATING PILL NAVBAR: Instagram | TikTok | YouTube (Otomatis reset link saat berpindah tab) */}
        <nav
          aria-label="Pilih Platform"
          className="dafian-pill-nav p-1.5 rounded-full flex items-center gap-1"
        >
          {(["instagram", "tiktok", "youtube"] as WorkspacePlatform[]).map(
            (plat) => {
              const isCurrent = activePlatform === plat;
              const meta = PLATFORMS[plat];
              return (
                <button
                  key={plat}
                  type="button"
                  onClick={() => handleSelectPlatform(plat)}
                  aria-current={isCurrent ? "page" : undefined}
                  title={`Pilih ${meta.name}`}
                  className={`min-h-[44px] px-4 py-2 rounded-full text-xs sm:text-sm font-medium flex items-center gap-2 transition-all cursor-pointer ${
                    isCurrent
                      ? "bg-[var(--bronze-bg)] text-[var(--text-primary)] border border-[var(--border-accent)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <span
                    style={{
                      color: isCurrent ? meta.color : "currentColor",
                    }}
                  >
                    <PlatformIcon platform={plat} className="w-4 h-4" />
                  </span>
                  <span>{meta.name}</span>
                </button>
              );
            }
          )}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              theme === "dark" ? "Ganti ke Mode Terang" : "Ganti ke Mode Gelap"
            }
            className="min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs font-mono-tech flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            {theme === "dark" ? (
              <>
                <svg
                  className="w-3.5 h-3.5 text-[var(--bronze)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                <span className="hidden sm:inline">Terang</span>
              </>
            ) : (
              <>
                <svg
                  className="w-3.5 h-3.5 text-[var(--bronze)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                <span className="hidden sm:inline">Gelap</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* MAIN DOWNLOADER WORKSPACE */}
      <main
        id="downloader"
        className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-16 space-y-6"
      >
        {/* HERO TITLE */}
        <div
          key={activePlatform}
          className="text-center space-y-2 animate-fade-slide"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-color)] text-xs font-mono-tech text-[var(--text-secondary)]">
            <span style={{ color: currentMeta.color }}>
              <PlatformIcon platform={activePlatform} className="w-3.5 h-3.5" />
            </span>
            <span>{currentMeta.name}</span>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl text-[var(--text-primary)] tracking-tight pt-1">
            {currentMeta.name} Downloader
          </h1>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
            {currentMeta.subtitle}
          </p>
        </div>

        {/* INPUT CARD TERPISAH KHUSUS PLATFORM AKTIF */}
        <section
          aria-label={`Form ${currentMeta.inputLabel}`}
          className="dafian-card rounded-2xl p-4 sm:p-6 space-y-4"
        >
          {/* Header Status Input Khusus Sosmed */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[var(--border-color)]">
            <div className="flex items-center gap-2 font-mono-tech text-xs text-[var(--text-primary)]">
              <span style={{ color: currentMeta.color }}>
                <PlatformIcon platform={activePlatform} className="w-4 h-4" />
              </span>
              <span className="font-bold">{currentMeta.inputLabel}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono-tech text-[11px] text-[var(--text-muted)]">
                Domain wajib: {currentMeta.domainHint}
              </span>
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              processUrl(inputUrl, activePlatform);
            }}
            className="space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1 flex items-center">
                <label
                  htmlFor={`url-input-${activePlatform}`}
                  className="sr-only"
                >
                  {currentMeta.placeholder}
                </label>
                <input
                  id={`url-input-${activePlatform}`}
                  type="text"
                  value={inputUrl}
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder={currentMeta.placeholder}
                  className={`w-full min-h-[52px] pl-4 pr-24 py-3 rounded-xl bg-[var(--bg-input)] border text-[var(--text-primary)] placeholder:text-[var(--text-muted)] text-sm outline-none transition-colors ${
                    urlValidation.state === "mismatch" ||
                    urlValidation.state === "invalid"
                      ? "border-[#ef4444]"
                      : urlValidation.state === "valid"
                      ? "border-[#4ade80]/60 focus:border-[#4ade80]"
                      : "border-[var(--border-color)] focus:border-[var(--bronze)]"
                  }`}
                />
                {inputUrl ? (
                  <button
                    type="button"
                    onClick={handleClearCurrentLink}
                    className="absolute right-1.5 min-h-[44px] px-3 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-color)] font-mono-tech text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                  >
                    Hapus
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleOneTapPaste}
                    className="absolute right-1.5 min-h-[44px] px-3.5 rounded-lg bg-[var(--bronze-bg)] border border-[var(--border-accent)] font-mono-tech text-xs text-[var(--bronze)] hover:opacity-90 cursor-pointer"
                  >
                    Tempel
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={
                  status === "loading" ||
                  urlValidation.state === "mismatch" ||
                  urlValidation.state === "invalid"
                }
                className="dafian-btn-primary min-h-[52px] px-7 py-3 rounded-xl font-semibold text-sm sm:text-base cursor-pointer shrink-0 disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {status === "loading" ? "Memproses..." : "Download"}
              </button>
            </div>

            {/* Indikator Validasi Link Sesuai Sosmed */}
            {urlValidation.state !== "empty" && (
              <div
                className={`font-mono-tech text-xs flex items-center gap-2 px-3 py-2 rounded-lg border ${
                  urlValidation.state === "valid"
                    ? "bg-[#4ade80]/10 border-[#4ade80]/30 text-[#4ade80]"
                    : "bg-[#ef4444]/10 border-[#ef4444]/35 text-[#f87171]"
                }`}
              >
                <span>{urlValidation.message}</span>
              </div>
            )}
          </form>

          {/* CONTOH LINK RINGKAS (Khusus Sosmed Aktif) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono-tech text-[11px] text-[var(--text-muted)] mr-1">
                Contoh {currentMeta.name}:
              </span>
              {currentSamples.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => {
                    setCurrentPlatformUrl(sample.url, activePlatform);
                    processUrl(sample.url, activePlatform);
                  }}
                  className="min-h-[44px] px-3.5 py-2 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-color)] hover:border-[var(--border-accent)] font-mono-tech text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer transition-colors"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* AREA HASIL & STATE (Empty, Loading, Error, Success) */}
        <section aria-live="polite" className="space-y-4">
          {/* LOADING */}
          {status === "loading" && (
            <div className="dafian-card rounded-2xl p-6 text-center space-y-3 animate-fade-slide">
              <div className="w-6 h-6 mx-auto rounded-full border-2 border-[var(--border-color)] border-t-[var(--bronze)] animate-spin" />
              <p className="font-mono-tech text-xs text-[var(--text-secondary)]">
                Mengambil media dari {currentMeta.name}...
              </p>
            </div>
          )}

          {/* ERROR */}
          {status === "error" && (
            <div
              role="alert"
              className="dafian-card rounded-2xl p-5 border border-[#ef4444]/40 text-center space-y-3 animate-fade-slide"
            >
              <p className="text-sm text-[#f87171] font-medium">
                {errorMessage}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {currentSamples[0] && (
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPlatformUrl(
                        currentSamples[0].url,
                        activePlatform
                      );
                      processUrl(currentSamples[0].url, activePlatform);
                    }}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-[var(--bronze-bg)] border border-[var(--border-accent)] font-mono-tech text-xs text-[var(--bronze)] cursor-pointer"
                  >
                    Coba Contoh {currentMeta.name}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleClearCurrentLink}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-[var(--border-color)] font-mono-tech text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Hapus Link
                </button>
              </div>
            </div>
          )}

          {/* EMPTY STATE RINGKAS */}
          {status === "idle" && (
            <div className="grid grid-cols-3 gap-2.5 text-center pt-1">
              <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-color)]">
                <span className="font-mono-tech text-xs font-bold text-[var(--bronze)] block">
                  1080p HD
                </span>
                <span className="text-xs text-[var(--text-secondary)] mt-0.5 block">
                  Tanpa Watermark
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-color)]">
                <span className="font-mono-tech text-xs font-bold text-[var(--bronze)] block">
                  MP3 Audio
                </span>
                <span className="text-xs text-[var(--text-secondary)] mt-0.5 block">
                  Suara Jernih
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-color)]">
                <span className="font-mono-tech text-xs font-bold text-[var(--bronze)] block">
                  Multi-Slide
                </span>
                <span className="text-xs text-[var(--text-secondary)] mt-0.5 block">
                  Foto &amp; Komentar IG
                </span>
              </div>
            </div>
          )}

          {/* SUCCESS RESULTS (Unified JSON Schema - PRD Bagian 3.3) */}
          {status === "success" && result && (
            <div className="space-y-4 animate-fade-slide">
              {/* KARTU 1: KOMENTAR / CAPTION INSTAGRAM */}
              {result.comment && (
                <article
                  aria-label="Komentar dan Caption Instagram"
                  className="dafian-card rounded-2xl p-5 sm:p-6 space-y-4 border border-[var(--border-accent)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={commentAvatarDisplayUrl}
                        alt={result.comment.username || result.author.username}
                        className="w-9 h-9 rounded-full object-cover border border-[var(--border-accent)]"
                      />
                      <div>
                        <h2 className="text-sm font-bold text-[var(--text-primary)]">
                          @{result.comment.username || result.author.username}
                        </h2>
                        <span className="font-mono-tech text-[11px] text-[var(--text-muted)]">
                          {result.comment.sourceLabel ||
                            `Komentar #${result.comment.id}`}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyComment(result.comment!.text)}
                      className={`min-h-[44px] px-5 py-2 rounded-xl font-mono-tech text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
                        copiedComment
                          ? "bg-[#16a34a] text-white"
                          : "dafian-btn-primary"
                      }`}
                    >
                      <svg
                        className="w-4 h-4 shrink-0"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        aria-hidden="true"
                      >
                        {copiedComment ? (
                          <polyline points="20 6 9 17 4 12" />
                        ) : (
                          <>
                            <rect
                              x="9"
                              y="9"
                              width="13"
                              height="13"
                              rx="2"
                              ry="2"
                            />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </>
                        )}
                      </svg>
                      <span>{copiedComment ? "Tersalin!" : "Salin Teks"}</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--bg-input)] border border-[var(--border-color)]">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--text-primary)] m-0 select-all">
                      {result.comment.text}
                    </pre>
                  </div>
                </article>
              )}

              {/* KARTU 2: MEDIA DOWNLOADER */}
              <article
                aria-label="Hasil Media"
                className="dafian-card rounded-2xl p-5 sm:p-6 space-y-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={avatarDisplayUrl}
                      alt={result.author.username}
                      className="w-10 h-10 rounded-full object-cover border border-[var(--border-color)] shrink-0"
                    />
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-[var(--text-primary)] leading-snug">
                        {result.media.title}
                      </h2>
                      <p className="font-mono-tech text-xs text-[var(--text-secondary)] mt-0.5">
                        @{result.author.username}
                      </p>
                    </div>
                  </div>
                </div>

                {/* GALERI MULTI-SLIDE (CAROUSEL ITEMS) */}
                {result.media.carouselItems.length > 0 ? (
                  <div className="space-y-3">
                    {result.media.carouselItems[activeSlideIdx] && (
                      <div className="rounded-xl overflow-hidden border border-[var(--border-color)] bg-[#080808]">
                        <img
                          src={toProxyDownloadUrl({
                            rawUrl:
                              result.media.carouselItems[activeSlideIdx]
                                .previewUrl ||
                              result.media.carouselItems[activeSlideIdx].url ||
                              result.media.thumbnail,
                            platform: result.platform,
                            format: "jpg",
                            id: `${shortcodeId}_preview_${activeSlideIdx + 1}`,
                            inline: true,
                          })}
                          alt={`${result.media.title} Slide ${
                            activeSlideIdx + 1
                          }`}
                          className="w-full max-h-60 object-contain mx-auto"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {result.media.carouselItems.map((slide, idx) => {
                        const slideId = `slide-${idx + 1}`;
                        const slideFormat =
                          slide.type === "video" ? "mp4" : "jpg";
                        const slideProxyUrl = toProxyDownloadUrl({
                          rawUrl: slide.url,
                          platform: result.platform,
                          format: slideFormat,
                          quality: slide.resolution,
                          id: `${shortcodeId}_slide_${idx + 1}`,
                        });

                        return (
                          <div
                            key={slideId}
                            className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 ${
                              idx === activeSlideIdx
                                ? "border-[var(--bronze)] bg-[var(--bronze-bg)]"
                                : "border-[var(--border-color)] bg-[var(--bg-subtle)]"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setActiveSlideIdx(idx)}
                              className="min-h-[44px] text-left cursor-pointer flex items-center justify-between font-mono-tech text-xs px-1"
                            >
                              <span className="text-[var(--text-primary)] font-bold">
                                Slide 0{idx + 1}
                              </span>
                              <span className="text-[var(--text-secondary)] text-[11px]">
                                {slide.resolution}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleTriggerDownload(slideId, slideProxyUrl)
                              }
                              className="dafian-btn-primary w-full min-h-[44px] px-3 py-2 rounded-lg font-mono-tech text-xs font-bold cursor-pointer"
                            >
                              {activeDownloadId === slideId
                                ? "Mengunduh..."
                                : `Download .${slideFormat.toUpperCase()}`}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl overflow-hidden border border-[var(--border-color)] bg-[#080808]">
                    <img
                      src={thumbnailDisplayUrl}
                      alt={result.media.title}
                      className="w-full max-h-60 object-contain mx-auto"
                    />
                  </div>
                )}

                {/* PRATINJAU AUDIO RINGKAS */}
                {(result.media.audioMp3Url || result.media.videoHdUrl) && (
                  <div className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-color)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={handleToggleAudioPreview}
                        aria-label={
                          isPlayingAudio ? "Jeda Audio" : "Putar Audio"
                        }
                        className="w-11 h-11 min-h-[44px] min-w-[44px] rounded-lg bg-[var(--bronze-bg)] border border-[var(--border-accent)] text-[var(--bronze)] flex items-center justify-center cursor-pointer shrink-0"
                      >
                        {isPlayingAudio ? (
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <rect x="6" y="4" width="4" height="16" />
                            <rect x="14" y="4" width="4" height="16" />
                          </svg>
                        ) : (
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                      </button>
                      <div className="truncate">
                        <span className="text-xs font-semibold text-[var(--text-primary)] block truncate">
                          Original Audio • @{result.author.username}
                        </span>
                        <span className="font-mono-tech text-[11px] text-[var(--text-secondary)]">
                          MP3 • 320kbps
                        </span>
                      </div>
                    </div>

                    <audio
                      ref={audioRef}
                      src={audioPreviewUrl}
                      onEnded={() => setIsPlayingAudio(false)}
                      onPause={() => setIsPlayingAudio(false)}
                      onPlay={() => setIsPlayingAudio(true)}
                      className="hidden"
                    />
                  </div>
                )}

                {/* TOMBOL DOWNLOAD UTAMA */}
                <div className="space-y-2.5">
                  {result.media.videoHdUrl && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          handleTriggerDownload("video-hd", hdDownloadUrl)
                        }
                        className="dafian-btn-primary w-full min-h-[48px] px-5 py-3 rounded-xl font-semibold text-sm flex items-center justify-between gap-2 cursor-pointer transition-all"
                      >
                        <span className="flex items-center gap-2">
                          <svg
                            className="w-4 h-4 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            aria-hidden="true"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          <span>
                            {activeDownloadId === "video-hd"
                              ? "Mengunduh Video..."
                              : "Download Video Full HD (.mp4)"}
                          </span>
                        </span>
                        <span className="font-mono-tech text-xs opacity-85">
                          1080p • No WM
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleTriggerDownload("video-sd", sdDownloadUrl)
                        }
                        className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-color)] hover:border-[var(--border-accent)] text-[var(--text-primary)] font-semibold text-sm flex items-center justify-between gap-2 cursor-pointer transition-all"
                      >
                        <span className="flex items-center gap-2">
                          <svg
                            className="w-4 h-4 shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            aria-hidden="true"
                          >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          <span>
                            {activeDownloadId === "video-sd"
                              ? "Mengunduh Video..."
                              : "Download Video Cepat (.mp4)"}
                          </span>
                        </span>
                        <span className="font-mono-tech text-xs opacity-85">
                          720p
                        </span>
                      </button>
                    </>
                  )}

                  {(result.media.audioMp3Url || result.media.videoHdUrl) && (
                    <button
                      type="button"
                      onClick={() => handleAudioDownload(result)}
                      className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-color)] hover:border-[var(--border-accent)] text-[var(--text-primary)] font-semibold text-sm flex items-center justify-between gap-2 cursor-pointer transition-colors"
                    >
                      <span className="flex items-center gap-2">
                        <svg
                          className="w-4 h-4 shrink-0 text-[var(--bronze)]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          aria-hidden="true"
                        >
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                        <span>
                          {activeDownloadId === "audio-mp3"
                            ? "Mengekstrak Audio MP3..."
                            : "Download Audio (.mp3)"}
                        </span>
                      </span>
                      <span className="font-mono-tech text-xs text-[var(--text-secondary)]">
                        320kbps
                      </span>
                    </button>
                  )}
                </div>
              </article>
            </div>
          )}
        </section>
      </main>

      {/* MINIMAL DAFIAN FOOTER */}
      <footer className="border-t border-[var(--border-color)] py-6 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm text-[var(--bronze)]">
              Dafian Downloader
            </span>
            <span>•</span>
            <span>Instagram • TikTok • YouTube</span>
          </div>

          <Link
            href="/admin"
            className="min-h-[44px] inline-flex items-center px-2 font-mono-tech text-[11px] text-[var(--text-secondary)] hover:text-[var(--bronze)] transition-colors"
          >
            Admin Panel
          </Link>
        </div>
      </footer>
    </div>
  );
}
