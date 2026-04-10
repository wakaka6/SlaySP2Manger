import { useEffect, useState, useCallback, useRef, useTransition, useMemo } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { searchRemoteMods, openUrlInBrowser, getAppBootstrap, listInstalledMods, listDisabledMods, type RemoteMod, type InstalledMod } from "../../lib/desktop";
import { useNavigate } from "react-router-dom";
import { useDownloads } from "../../contexts/DownloadContext";
import {
  PackageSearch, Search, ServerOff, ExternalLink, Globe, Loader2,
  Download, ThumbsUp, TrendingUp, Clock, ArrowDownToLine, Crown, Library, ArrowUpCircle,
} from "lucide-react";

// ── Locale-aware Translation via MyMemory API ──────────────────────────
const translationCache = new Map<string, string>();

function getTranslationTarget(locale: string): string | null {
  const map: Record<string, string> = {
    "en-US": "en",
    "zh-CN": "zh-CN", "zh-TW": "zh-TW", "ja-JP": "ja", "ko-KR": "ko",
    "de-DE": "de", "fr-FR": "fr", "es-ES": "es", "pt-BR": "pt", "ru-RU": "ru",
  };
  return map[locale] ?? null;
}

function detectSourceLang(text: string): string {
  if (/[\u4e00-\u9fff]/.test(text)) return "zh";
  if (/[\u3040-\u30ff]/.test(text)) return "ja";
  if (/[\uac00-\ud7af]/.test(text)) return "ko";
  if (/[\u0400-\u04ff]/.test(text)) return "ru";
  return "en";
}

function isTargetLanguageText(text: string, locale: string): boolean {
  if (locale.startsWith("zh")) return /[\u4e00-\u9fff]/.test(text);
  if (locale.startsWith("ja")) return /[\u3040-\u30ff\u4e00-\u9fff]/.test(text);
  if (locale.startsWith("ko")) return /[\uac00-\ud7af]/.test(text);
  if (locale.startsWith("en")) return !/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0400-\u04ff]/.test(text);
  return false;
}

async function translateText(text: string, targetLangCode: string): Promise<string> {
  if (!text || text.length < 5) return text;
  const sourceLang = detectSourceLang(text);
  if (sourceLang === targetLangCode || (sourceLang === "zh" && targetLangCode.startsWith("zh"))) return text;
  const cacheKey = `${sourceLang}|${targetLangCode}|${text}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey)!;
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 500))}&langpair=${sourceLang}|${targetLangCode}`;
    const res = await fetch(url);
    const data = await res.json();
    const translated = data?.responseData?.translatedText as string | undefined;
    if (translated && !translated.includes("MYMEMORY WARNING")) {
      translationCache.set(cacheKey, translated);
      return translated;
    }
    return text;
  } catch { return text; }
}

const PAGE_SIZE = 20;

type SortOption = { key: string; label: string; icon: React.ReactNode };

/** Normalise a version string for comparison: strip leading "v", trim whitespace. */
function normalizeVersion(v: string | null | undefined): string {
  if (!v) return "";
  return v.trim().replace(/^v/i, "").trim();
}

/** Simple numeric-segment comparison. Returns true when remote > local. */
function isNewerVersion(local: string, remote: string): boolean {
  const nl = normalizeVersion(local);
  const nr = normalizeVersion(remote);
  if (!nl || !nr || nl === nr) return false;
  const lp = nl.split(/[.\-+]/).map(Number);
  const rp = nr.split(/[.\-+]/).map(Number);
  const len = Math.max(lp.length, rp.length);
  for (let i = 0; i < len; i++) {
    const a = lp[i] ?? 0;
    const b = rp[i] ?? 0;
    if (isNaN(a) || isNaN(b)) return nl !== nr; // fallback: treat as update if strings differ
    if (b > a) return true;
    if (b < a) return false;
  }
  return false;
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

type UpdatableMod = RemoteMod & { localVersion: string };

export function DiscoverPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { startDownload, isDownloading } = useDownloads();
  const listRef = useRef<HTMLDivElement>(null);

  // ── React 18 transition: heavy state updates won't block sidebar clicks ──
  const [isPending, startTransition] = useTransition();

  const sortOptions: SortOption[] = [
    { key: "latest_added", label: t("discover.filterNewest"), icon: <Clock size={12} /> },
    { key: "latest_updated", label: t("discover.filterLatestUpdated"), icon: <ArrowDownToLine size={12} /> },
    { key: "trending", label: t("discover.filterPopular"), icon: <TrendingUp size={12} /> },
    { key: "downloads", label: t("discover.filterDownloads"), icon: <Download size={12} /> },
  ];

  const [query, setQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [sortBy, setSortBy] = useState("latest_added");
  const [results, setResults] = useState<RemoteMod[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selected, setSelected] = useState<RemoteMod | null>(null);

  // Separate loading states: initial load vs. refreshing with stale data visible
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [translatedSummary, setTranslatedSummary] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isPremium, setIsPremium] = useState(true); // optimistic default
  const [failedImageUrls, setFailedImageUrls] = useState<Record<string, true>>({});

  // ── "Has Updates" filter mode ──
  const [updatesMode, setUpdatesMode] = useState(false);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updatableMods, setUpdatableMods] = useState<UpdatableMod[]>([]);
  const [heroImageLoaded, setHeroImageLoaded] = useState(false);

  // Unique request ID to cancel stale requests
  const requestIdRef = useRef(0);
  const updatesRequestIdRef = useRef(0);

  useEffect(() => {
    getAppBootstrap().then((b) => setIsPremium(b.nexusIsPremium)).catch(() => {});
  }, []);

  const markImageFailed = useCallback((url: string | null) => {
    if (!url) return;
    setFailedImageUrls((prev) => {
      if (prev[url]) return prev;
      return { ...prev, [url]: true };
    });
  }, []);

  function getUsableImageUrl(candidates: Array<string | null | undefined>): string | null {
    for (const candidate of candidates) {
      if (candidate && !failedImageUrls[candidate]) {
        return candidate;
      }
    }
    return null;
  }

  function getRowImageUrl(mod: RemoteMod): string | null {
    return getUsableImageUrl([mod.thumbnailUrl, mod.thumbnailLargeUrl, mod.pictureUrl]);
  }

  function getHeroImageUrl(mod: RemoteMod): string | null {
    return getUsableImageUrl([mod.pictureUrl, mod.thumbnailLargeUrl, mod.thumbnailUrl]);
  }



  // ── Main search effect — optimized for non-blocking UX ──
  useEffect(() => {
    const reqId = ++requestIdRef.current;

    // If we already have results, show a subtle refresh indicator
    // instead of clearing everything (keep stale data visible)
    if (results.length > 0) {
      setIsRefreshing(true);
    } else {
      setIsInitialLoad(true);
    }
    setErrorState(null);

    searchRemoteMods(committedQuery, sortBy, 0, PAGE_SIZE)
      .then((result) => {
        // Stale response — a newer request was fired
        if (reqId !== requestIdRef.current) return;

        // Use startTransition so this heavy state batch
        // doesn't block the main thread (sidebar stays clickable)
        startTransition(() => {
          setResults(result.items);
          setTotalCount(result.totalCount);
          setSelected((cur) => {
            if (cur && result.items.some((i) => i.remoteId === cur.remoteId)) return cur;
            return result.items[0] ?? null;
          });
          setIsInitialLoad(false);
          setIsRefreshing(false);
        });
      })
      .catch((e) => {
        if (reqId !== requestIdRef.current) return;
        setIsInitialLoad(false);
        setIsRefreshing(false);
        setErrorState(e instanceof Error ? e.message : String(e));
      });

    // Cleanup: mark this request as stale if deps change
    return () => {
      // We don't need to do anything because reqId check handles staleness
    };
  }, [committedQuery, sortBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = useCallback(async () => {
    if (isLoadingMore || results.length >= totalCount) return;
    setIsLoadingMore(true);
    try {
      const result = await searchRemoteMods(committedQuery, sortBy, results.length, PAGE_SIZE);
      startTransition(() => {
        setResults((prev) => [...prev, ...result.items]);
        setTotalCount(result.totalCount);
      });
    } catch (e) {
      setErrorState(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoadingMore(false);
    }
  }, [committedQuery, sortBy, results.length, totalCount, isLoadingMore]);

  // ── Check for updates: search Nexus for each installed mod ──
  const checkForUpdates = useCallback(async () => {
    const reqId = ++updatesRequestIdRef.current;
    setUpdatesLoading(true);
    setUpdatableMods([]);
    setErrorState(null);

    // Let the pressed state / loading indicator paint before heavy work starts.
    await nextAnimationFrame();

    try {
      const [enabled, disabled] = await Promise.all([listInstalledMods(), listDisabledMods()]);
      if (reqId !== updatesRequestIdRef.current) return;

      const allLocal: InstalledMod[] = [...enabled, ...disabled];
      if (allLocal.length === 0) {
        return;
      }

      const updatable: UpdatableMod[] = [];

      // Search Nexus for each installed mod by name (with concurrency limit)
      const CONCURRENCY = 3;
      let idx = 0;
      const tasks = async () => {
        while (idx < allLocal.length) {
          if (reqId !== updatesRequestIdRef.current) return;
          const mod = allLocal[idx++];
          if (!mod.name || !mod.version) continue;
          try {
            const result = await searchRemoteMods(mod.name, "latest_updated", 0, 5);
            if (reqId !== updatesRequestIdRef.current) return;

            // Find a remote mod whose name closely matches
            const match = result.items.find(
              (r) => r.name.toLowerCase() === mod.name.toLowerCase(),
            );
            if (match && match.latestVersion && isNewerVersion(mod.version, match.latestVersion)) {
              updatable.push({ ...match, localVersion: mod.version });

              // Incrementally refresh results so users can interact before full completion.
              startTransition(() => {
                if (reqId === updatesRequestIdRef.current) {
                  setUpdatableMods([...updatable]);
                }
              });
            }
          } catch {
            // Skip mods whose search fails
          }

          // Yield periodically to keep the renderer responsive.
          if (idx % 2 === 0) {
            await yieldToMainThread();
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, tasks));
      if (reqId !== updatesRequestIdRef.current) return;

      startTransition(() => {
        if (reqId !== updatesRequestIdRef.current) return;
        setUpdatableMods([...updatable]);
        setSelected((cur) => {
          if (cur && updatable.some((i) => i.remoteId === cur.remoteId)) return cur;
          return updatable[0] ?? null;
        });
      });
    } catch (e) {
      if (reqId !== updatesRequestIdRef.current) return;
      setErrorState(e instanceof Error ? e.message : String(e));
    } finally {
      if (reqId === updatesRequestIdRef.current) {
        setUpdatesLoading(false);
      }
    }
  }, []);

  const handleToggleUpdatesMode = useCallback(() => {
    setUpdatesMode((prev) => {
      const next = !prev;
      if (next) {
        // Run outside the click call stack to avoid blocking input feedback.
        window.setTimeout(() => {
          void checkForUpdates();
        }, 0);
      } else {
        updatesRequestIdRef.current += 1;
        setUpdatesLoading(false);
        setUpdatableMods([]);
      }
      return next;
    });
  }, [checkForUpdates]);

  // Build a lookup map of updatable remote IDs → local version (for badge rendering)
  const updatableMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const um of updatableMods) m.set(um.remoteId, um.localVersion);
    return m;
  }, [updatableMods]);

  // Infinite scroll
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 80) {
        void loadMore();
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loadMore]);

  const translationTarget = getTranslationTarget(locale);
  useEffect(() => {
    if (!selected?.summary || !translationTarget) { setTranslatedSummary(null); return; }
    if (isTargetLanguageText(selected.summary, locale)) { setTranslatedSummary(null); return; }
    setIsTranslating(true);
    setTranslatedSummary(null);
    translateText(selected.summary, translationTarget).then((result) => {
      setTranslatedSummary(result !== selected.summary ? result : null);
      setIsTranslating(false);
    });
  }, [selected?.remoteId, selected?.summary, translationTarget, locale]);

  const handleTranslate = useCallback(async () => {
    if (!selected?.summary || isTranslating || !translationTarget) return;
    setIsTranslating(true);
    const result = await translateText(selected.summary, translationTarget);
    setTranslatedSummary(result !== selected.summary ? result : null);
    setIsTranslating(false);
  }, [selected, isTranslating, translationTarget]);

  function fmtNum(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  function handleOpenNexus(url: string) {
    openUrlInBrowser(url).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }

  const hasMore = results.length < totalCount;

  // Derived: show skeletons only for initial load without any stale data
  const showSkeletons = isInitialLoad && results.length === 0;
  // Show a subtle progress bar when refreshing with stale data visible
  const showRefreshBar = isRefreshing || isPending;
  const selectedHeroImageUrl = selected ? getHeroImageUrl(selected) : null;

  useEffect(() => {
    setHeroImageLoaded(!selectedHeroImageUrl);
  }, [selected?.remoteId, selectedHeroImageUrl]);

  const renderSkeletons = () =>
    Array.from({ length: 8 }).map((_, i) => (
      <div className="discover-row discover-row--skeleton" key={i}>
        <div className="skeleton-text" style={{ width: "40%", height: "14px" }} />
        <div className="skeleton-text" style={{ width: "25%", height: "11px", marginTop: 4 }} />
      </div>
    ));

  // Determine display list: in updates mode use updatableMods, otherwise normal results
  const displayList: RemoteMod[] = updatesMode ? updatableMods : results;

  const renderList = () => {
    // Updates mode: special loading / empty states
    if (updatesMode) {
      if (updatesLoading) {
        return (
          <div className="discover-empty">
            <Loader2 size={28} className="spin-icon" style={{ opacity: 0.4 }} />
            <p>{t("discover.updatesLoading")}</p>
          </div>
        );
      }
      if (errorState && updatableMods.length === 0) {
        return (
          <div className="discover-empty">
            <ServerOff size={36} style={{ opacity: 0.25 }} />
            <h3>{t("discover.statusFailed")}</h3>
            <p>{errorState}</p>
          </div>
        );
      }
      if (updatableMods.length === 0) {
        return (
          <div className="discover-empty">
            <PackageSearch size={36} style={{ opacity: 0.25 }} />
            <p>{t("discover.noUpdates")}</p>
          </div>
        );
      }
    }

    if (showSkeletons) return renderSkeletons();

    if (errorState && results.length === 0) {
      const isMissingKey = errorState.includes("MISSING_API_KEY") || errorState.includes("INVALID_API_KEY");
      if (isMissingKey) {
        return (
          <div className="discover-empty">
            <ServerOff size={36} style={{ opacity: 0.25 }} />
            <h3>{t("discover.apiKeyMissing")}</h3>
            <p>{errorState.includes("INVALID") ? t("discover.apiKeyInvalid") : t("discover.apiKeyMissingHelp")}</p>
            <button className="button button--primary button--compact" onClick={() => navigate("/settings")}>
              {t("discover.configureApiKey")}
            </button>
          </div>
        );
      }
      return (
        <div className="discover-empty">
          <ServerOff size={36} style={{ opacity: 0.25 }} />
          <h3>{t("discover.statusFailed")}</h3>
          <p>{errorState}</p>
        </div>
      );
    }

    if (results.length === 0 && !isInitialLoad) {
      return (
        <div className="discover-empty">
          <PackageSearch size={36} style={{ opacity: 0.25 }} />
          <h3>{t("discover.noResults")}</h3>
          <p>{t("discover.noResultsHelp")}</p>
        </div>
      );
    }

    return (
      <>
        {displayList.map((item) => {
          const isActive = selected?.remoteId === item.remoteId;
          const rowImageUrl = getRowImageUrl(item);
          const localVer = updatableMap.get(item.remoteId);
          return (
            <button
              className={`discover-row${isActive ? " is-active" : ""}${showRefreshBar && !updatesMode ? " is-stale" : ""}`}
              key={item.remoteId}
              onClick={() => setSelected(item)}
              type="button"
            >
              <div className="discover-row__avatar">
                {rowImageUrl ? (
                  <img
                    alt=""
                    className="discover-row__avatar-image"
                    decoding="async"
                    loading="lazy"
                    onError={() => markImageFailed(rowImageUrl)}
                    referrerPolicy="no-referrer"
                    src={rowImageUrl}
                  />
                ) : (
                  <span className="discover-row__avatar-fallback">
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="discover-row__body">
                <div className="discover-row__name">
                  {item.name}
                  {localVer && (
                    <span className="discover-row__update-badge" title={t("discover.updateAvailable")}>
                      <ArrowUpCircle size={12} />
                    </span>
                  )}
                </div>
                <div className="discover-row__meta">
                  {item.author ?? t("discover.unknownAuthor")}
                  <span className="discover-row__dot" />
                  v{item.latestVersion ?? "?"}
                  {localVer && (
                    <>
                      <span className="discover-row__dot" />
                      <span className="discover-row__local-ver">
                        {t("discover.localVersion", { version: normalizeVersion(localVer) })}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="discover-row__stats">
                <span><ThumbsUp size={10} /> {fmtNum(item.endorsementCount)}</span>
                <span><Download size={10} /> {fmtNum(item.downloadCount)}</span>
              </div>
            </button>
          );
        })}

        {!updatesMode && isLoadingMore && (
          <div className="discover-row discover-row--loading">
            <Loader2 size={14} className="spin-icon" />
          </div>
        )}
        {!updatesMode && !hasMore && results.length > 0 && (
          <div className="discover-row discover-row--end">{t("discover.noMore")}</div>
        )}
      </>
    );
  };

  return (
    <section className="discover-page">
      {/* ── Subtle refresh progress bar ──────────────── */}
      {showRefreshBar && (
        <div className="discover-refresh-bar">
          <div className="discover-refresh-bar__track" />
        </div>
      )}

      {/* ── Toolbar: search + sort inline ──────────────── */}
      <div className="discover-toolbar2">
        <div className="discover-toolbar2__search">
          <Search size={15} className="discover-toolbar2__icon" />
          <input
            className="discover-toolbar2__input"
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value.trim()) setCommittedQuery("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") setCommittedQuery(query);
            }}
            placeholder={t("discover.searchPlaceholder")}
            value={query}
          />
          {query && query !== committedQuery && (
            <span className="search-field__enter-hint">Enter ↵</span>
          )}
        </div>
        <div className="discover-toolbar2__right">
          <div className="discover-toolbar2__sorts">
            {sortOptions.map((opt) => (
              <button
                className={`discover-sort-chip${!updatesMode && sortBy === opt.key ? " is-active" : ""}`}
                key={opt.key}
                onClick={() => {
                  if (updatesMode) { setUpdatesMode(false); setUpdatableMods([]); }
                  setSortBy(opt.key);
                }}
                type="button"
              >
                {opt.icon}
                <span>{opt.label}</span>
              </button>
            ))}
            <span className="discover-toolbar2__sorts-divider" />
            <button
              className={`discover-sort-chip discover-sort-chip--updates${updatesMode ? " is-active" : ""}`}
              onClick={handleToggleUpdatesMode}
              type="button"
            >
              {updatesLoading ? <Loader2 size={12} className="spin-icon" /> : <ArrowUpCircle size={12} />}
              <span>{t("discover.filterUpdates")}</span>
            </button>
          </div>
          {!updatesMode && totalCount > 0 && !isInitialLoad && (
            <span className="discover-toolbar2__count">
              {t("discover.totalCount", { total: totalCount })}
            </span>
          )}
          {updatesMode && !updatesLoading && updatableMods.length > 0 && (
            <span className="discover-toolbar2__count">
              {t("discover.updatesCount", { count: updatableMods.length })}
            </span>
          )}
        </div>
      </div>

      {/* ── Main: list + detail ──────────────────────── */}
      <div className="discover-main">
        <div className="discover-scroll" ref={listRef}>
          {renderList()}
        </div>

        <aside className="discover-detail2">
          {showSkeletons ? (
            <div className="discover-detail2__skeleton">
              <div className="skeleton-text" style={{ width: "60%", height: "20px", marginBottom: "10px" }} />
              <div className="skeleton-text" style={{ width: "40%", height: "12px", marginBottom: "24px" }} />
              <div className="skeleton-text" style={{ width: "100%", height: "12px", marginBottom: "6px" }} />
              <div className="skeleton-text" style={{ width: "85%", height: "12px" }} />
            </div>
          ) : selected ? (
            <div className="discover-detail2__inner">
              <div className="discover-detail2__media">
                {selectedHeroImageUrl ? (
                  <>
                    {!heroImageLoaded ? (
                      <div className="discover-detail2__media-loading" aria-hidden="true">
                        <div className="discover-detail2__media-loading-shimmer" />
                        <div className="discover-detail2__media-loading-orbit">
                          <span className="discover-detail2__media-loading-ring discover-detail2__media-loading-ring--a" />
                          <span className="discover-detail2__media-loading-ring discover-detail2__media-loading-ring--b" />
                          <span className="discover-detail2__media-loading-ring discover-detail2__media-loading-ring--c" />
                        </div>
                        <div className="discover-detail2__media-loading-caption">
                          <span className="discover-detail2__media-loading-line discover-detail2__media-loading-line--wide" />
                          <span className="discover-detail2__media-loading-line discover-detail2__media-loading-line--narrow" />
                        </div>
                      </div>
                    ) : null}
                    <img
                      alt={selected.name}
                      className={`discover-detail2__media-image${heroImageLoaded ? " is-loaded" : ""}`}
                      decoding="async"
                      key={`${selected.remoteId}:${selectedHeroImageUrl}`}
                      onError={() => {
                        setHeroImageLoaded(true);
                        markImageFailed(selectedHeroImageUrl);
                      }}
                      onLoad={() => setHeroImageLoaded(true)}
                      referrerPolicy="no-referrer"
                      src={selectedHeroImageUrl}
                    />
                  </>
                ) : (
                  <div className="discover-detail2__media-fallback" aria-hidden="true">
                    <span>{selected.name.charAt(0).toUpperCase()}</span>
                  </div>
                )}
              </div>

              <div className="discover-detail2__head">
                <h2 className="discover-detail2__title">{selected.name}</h2>
                <div className="discover-detail2__author">
                  {selected.author ?? t("discover.unknownAuthor")} · v{selected.latestVersion ?? "?"}
                </div>
                {updatableMap.has(selected.remoteId) && (
                  <div className="discover-detail2__update-hint">
                    <ArrowUpCircle size={13} />
                    <span>
                      {t("discover.updateAvailable")} — {t("discover.localVersion", { version: normalizeVersion(updatableMap.get(selected.remoteId)) })}
                    </span>
                  </div>
                )}
                <div className="discover-detail2__chips">
                  <span className="discover-chip"><ThumbsUp size={11} /> {fmtNum(selected.endorsementCount)}</span>
                  <span className="discover-chip"><Download size={11} /> {fmtNum(selected.downloadCount)}</span>
                </div>
              </div>

              <div className="discover-detail2__desc">
                <p>
                  {(selected.summary ?? t("discover.noSummary")).replace(/<br\s*\/?>/gi, "\n")}
                </p>

                {isTranslating && (
                  <div className="discover-translate-bar">
                    <Loader2 size={14} className="spin-icon" />
                    <span>{t("discover.translating")}</span>
                  </div>
                )}
                {translatedSummary && !isTranslating && (
                  <div className="discover-translated">
                    <div className="discover-translated__label">
                      <Globe size={12} />
                      <span>{t("discover.translated")}</span>
                    </div>
                    <p className="discover-translated__text">{translatedSummary}</p>
                  </div>
                )}
                {!translatedSummary && !isTranslating && translationTarget && selected.summary && !isTargetLanguageText(selected.summary, locale) && (
                  <button className="discover-translate-btn" onClick={handleTranslate} type="button">
                    <Globe size={13} />
                    <span>{t("discover.translateBtn")}</span>
                  </button>
                )}
              </div>

              <div className="discover-detail2__actions">
                <button
                  className="button button--primary"
                  onClick={() => startDownload(selected)}
                  disabled={isDownloading(selected.remoteId)}
                  type="button"
                >
                  {isDownloading(selected.remoteId) ? (
                    <><Loader2 size={14} className="spin-icon" /> {t("discover.downloadingBtn")}</>
                  ) : (
                    <><Download size={14} /> {t("discover.installBtn")}</>
                  )}
                </button>
                <button
                  className="button button--secondary"
                  onClick={() => handleOpenNexus(selected.detailUrl)}
                  type="button"
                >
                  <ExternalLink size={14} />
                  {t("discover.openNexus")}
                </button>
              </div>

              {!isPremium && (
                <div className="discover-manual-guide">
                  <div className="discover-manual-guide__header">
                    <Crown size={13} />
                    <span>{t("discover.premiumHint")}</span>
                  </div>
                  <ol className="discover-manual-guide__steps">
                    <li>{t("discover.manualStep1")}</li>
                    <li>{t("discover.manualStep2")}</li>
                    <li>{t("discover.manualStep3")}</li>
                  </ol>
                  <button
                    className="discover-manual-guide__btn"
                    onClick={() => navigate("/")}
                    type="button"
                  >
                    <Library size={13} />
                    {t("discover.goToLibrary")}
                  </button>
                </div>
              )}

              <a
                className="discover-detail2__link"
                href="#"
                onClick={(e) => { e.preventDefault(); handleOpenNexus(selected.detailUrl); }}
              >
                {selected.detailUrl}
              </a>
            </div>
          ) : (
            <div className="discover-empty" style={{ padding: "60px 20px" }}>
              <PackageSearch size={36} style={{ opacity: 0.2 }} />
              <p>{t("discover.previewEmpty")}</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
