import { convertFileSrc } from "@tauri-apps/api/core";
import {
  AlertTriangle,
  BookImage,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import MagicBento from "../../components/compendium/MagicBento";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusBadge } from "../../components/common/StatusBadge";
import { useI18n } from "../../i18n/I18nProvider";
import {
  detectGameInstall,
  getCompendiumIndex,
  type CompendiumCardDto,
  type CompendiumCardNativeAssetsDto,
  type CompendiumIndexDto,
  type CompendiumNativeFontsDto,
  updateGameRootDir,
} from "../../lib/desktop";
import "./CompendiumPage.css";

type PageCopy = {
  nav: string;
  title: string;
  description: string;
  searchPlaceholder: string;
  allCharacters: string;
  allTypes: string;
  allRarities: string;
  baseView: string;
  upgradedView: string;
  refresh: string;
  cards: string;
  gameVersion: string;
  snapshotVersion: string;
  localSource: string;
  stale: string;
  staleHint: string;
  loading: string;
  loadingHint: string;
  empty: string;
  detailHint: string;
  cardText: string;
  keywords: string;
  noKeywords: string;
  upgrades: string;
  notUpgradable: string;
  noUpgradeDelta: string;
  cost: string;
  target: string;
  rarity: string;
  type: string;
  character: string;
  id: string;
  className: string;
  noArt: string;
  refreshError: string;
  gamePathRequiredTitle: string;
  gamePathRequiredHint: string;
  openSettings: string;
  installedBuild: string;
  installedLocale: string;
  cardSerial: string;
  upgradeKeyword: string;
};

const COPY: Record<"zh-CN" | "en-US", PageCopy> = {
  "zh-CN": {
    nav: "卡牌图鉴",
    title: "卡牌图鉴",
    description: "基于本地游戏文件生成的《杀戮尖塔 2》卡牌索引，包含卡图、描述模板和升级变化。",
    searchPlaceholder: "搜索名称、ID、类名或关键词",
    allCharacters: "全部阵营",
    allTypes: "全部类型",
    allRarities: "全部稀有度",
    baseView: "基础",
    upgradedView: "升级",
    refresh: "刷新资源",
    cards: "张卡牌",
    gameVersion: "游戏版本",
    snapshotVersion: "快照版本",
    localSource: "本地图源",
    stale: "版本待校准",
    staleHint: "本地游戏版本与内置快照不一致，部分数值或文本可能存在轻微偏差。",
    loading: "正在构建图鉴…",
    loadingHint: "首次加载会从本地游戏缓存提取卡图到应用目录，通常只需等待一次。",
    empty: "当前筛选没有结果。",
    detailHint: "从左侧卡组中选择一张卡牌查看详情。",
    cardText: "卡牌描述",
    keywords: "关键词",
    noKeywords: "无关键词",
    upgrades: "升级变化",
    notUpgradable: "该卡不可升级",
    noUpgradeDelta: "当前版本没有额外的数值或关键词变化。",
    cost: "费用",
    target: "目标",
    rarity: "稀有度",
    type: "类型",
    character: "阵营",
    id: "ID",
    className: "类名",
    noArt: "暂无卡图",
    refreshError: "图鉴加载失败",
    gamePathRequiredTitle: "未检测到游戏目录",
    gamePathRequiredHint: "未能自动识别《杀戮尖塔 2》安装目录。请前往设置页填写或检测游戏目录后，再回来刷新资源。",
    openSettings: "前往设置",
    installedBuild: "本地安装版本",
    installedLocale: "当前读取语言",
    cardSerial: "卡片",
    upgradeKeyword: "关键词",
  },
  "en-US": {
    nav: "Compendium",
    title: "Compendium",
    description: "A local Slay the Spire 2 card index built from your installed game files, with portraits, template text, and upgrade deltas.",
    searchPlaceholder: "Search name, ID, class, or keywords",
    allCharacters: "All pools",
    allTypes: "All types",
    allRarities: "All rarities",
    baseView: "Base",
    upgradedView: "Upgraded",
    refresh: "Refresh assets",
    cards: "cards",
    gameVersion: "Game version",
    snapshotVersion: "Snapshot",
    localSource: "Local source",
    stale: "Snapshot mismatch",
    staleHint: "Your installed game version does not match the bundled snapshot, so some values or text may drift.",
    loading: "Building compendium…",
    loadingHint: "The first load extracts portraits from the local game cache into the app directory.",
    empty: "No cards match the current filters.",
    detailHint: "Select a card from the gallery to inspect it.",
    cardText: "Card text",
    keywords: "Keywords",
    noKeywords: "No keywords",
    upgrades: "Upgrade delta",
    notUpgradable: "This card does not upgrade",
    noUpgradeDelta: "No numeric or keyword delta in the current snapshot.",
    cost: "Cost",
    target: "Target",
    rarity: "Rarity",
    type: "Type",
    character: "Pool",
    id: "ID",
    className: "Class",
    noArt: "No portrait",
    refreshError: "Failed to load compendium",
    gamePathRequiredTitle: "Game install not found",
    gamePathRequiredHint: "Slay the Spire 2 could not be located automatically. Open Settings to set or detect the game directory, then refresh again.",
    openSettings: "Open Settings",
    installedBuild: "Installed build",
    installedLocale: "Current locale",
    cardSerial: "Card",
    upgradeKeyword: "Keyword",
  },
};

const CHARACTER_LABELS = {
  "zh-CN": {
    ironclad: "铁甲战士",
    silent: "静默猎手",
    defect: "故障机器人",
    regent: "摄政",
    necrobinder: "死灵缚师",
    event: "事件",
    colorless: "无色",
    status: "状态",
    curse: "诅咒",
    quest: "任务",
    none: "其他",
  },
  "en-US": {
    ironclad: "Ironclad",
    silent: "Silent",
    defect: "Defect",
    regent: "Regent",
    necrobinder: "Necrobinder",
    event: "Event",
    colorless: "Colorless",
    status: "Status",
    curse: "Curse",
    quest: "Quest",
    none: "Other",
  },
} as const;

const TYPE_LABELS = {
  "zh-CN": {
    attack: "攻击",
    skill: "技能",
    power: "能力",
    status: "状态",
    curse: "诅咒",
    quest: "任务",
    none: "其他",
  },
  "en-US": {
    attack: "Attack",
    skill: "Skill",
    power: "Power",
    status: "Status",
    curse: "Curse",
    quest: "Quest",
    none: "Other",
  },
} as const;

const RARITY_LABELS = {
  "zh-CN": {
    basic: "基础",
    common: "普通",
    uncommon: "罕见",
    rare: "稀有",
    ancient: "远古",
    event: "事件",
    token: "衍生",
    status: "状态",
    curse: "诅咒",
    quest: "任务",
    none: "其他",
  },
  "en-US": {
    basic: "Basic",
    common: "Common",
    uncommon: "Uncommon",
    rare: "Rare",
    ancient: "Ancient",
    event: "Event",
    token: "Token",
    status: "Status",
    curse: "Curse",
    quest: "Quest",
    none: "Other",
  },
} as const;

const TARGET_LABELS = {
  "zh-CN": {
    self: "自身",
    any_enemy: "任意敌人",
    all_enemies: "全体敌人",
    random_enemy: "随机敌人",
    any_player: "任意玩家",
    any_ally: "任意友方",
    all_allies: "全体友方",
    targeted_no_creature: "指定区域",
    osty: "Osty",
    none: "无",
  },
  "en-US": {
    self: "Self",
    any_enemy: "Any enemy",
    all_enemies: "All enemies",
    random_enemy: "Random enemy",
    any_player: "Any player",
    any_ally: "Any ally",
    all_allies: "All allies",
    targeted_no_creature: "Targeted area",
    osty: "Osty",
    none: "None",
  },
} as const;

type RichContext = {
  card: CompendiumCardDto;
  upgraded: boolean;
};

const NATIVE_TITLE_LATIN_FONT_FAMILY = "STS2TitleLatin";
const NATIVE_TITLE_CJK_FONT_FAMILY = "STS2TitleCjk";
const loadedFontFaces = new Map<string, Promise<void>>();
const localAssetUrlCache = new Map<string, string>();
const cardRichHtmlCache = new WeakMap<
  CompendiumCardDto,
  { base?: { __html: string }; upgraded?: { __html: string } }
>();

const INITIAL_GALLERY_RENDER_COUNT = 24;
const GALLERY_RENDER_BATCH_SIZE = 24;
const GALLERY_IDLE_TIMEOUT = 120;

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }
  if (Math.abs(value % 1) < 0.00001) {
    return String(Math.trunc(value));
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function normalizeChoiceToken(value: string) {
  return value.replace(/[_\s]/g, "").toLowerCase();
}

function splitTopLevel(source: string, delimiter: string) {
  const parts: string[] = [];
  let current = "";
  let braceDepth = 0;
  let parenDepth = 0;

  for (const char of source) {
    if (char === "{") braceDepth += 1;
    if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth = Math.max(0, parenDepth - 1);

    if (char === delimiter && braceDepth === 0 && parenDepth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  parts.push(current);
  return parts;
}

function buildVarMap(card: CompendiumCardDto, upgraded: boolean) {
  const values = new Map<string, string | number | boolean>();

  for (const item of card.vars) {
    if (item.value === null) continue;
    const upgradeDelta = upgraded ? card.upgrade.varDeltas[item.key] ?? 0 : 0;
    values.set(item.key, item.value + upgradeDelta);
  }

  values.set("IfUpgraded", upgraded);
  values.set("InCombat", false);
  values.set("CardType", toChoiceToken(card.typeName));
  values.set("TargetType", toTargetChoice(card.target));
  values.set("singleStarIcon", 1);
  return values;
}

function toChoiceToken(typeName: string) {
  switch (typeName) {
    case "attack":
      return "Attack";
    case "skill":
      return "Skill";
    case "power":
      return "Power";
    default:
      return typeName;
  }
}

function toTargetChoice(target: string) {
  switch (target) {
    case "all_enemies":
      return "AllEnemies";
    case "any_enemy":
      return "AnyEnemy";
    case "self":
      return "Self";
    default:
      return target;
  }
}

function findClosingBrace(source: string, start: number) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function resolveTemplateString(source: string, context: RichContext): string {
  let output = "";
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "{") {
      output += source[index];
      continue;
    }
    const end = findClosingBrace(source, index);
    if (end === -1) {
      output += source[index];
      continue;
    }
    output += evaluateExpression(source.slice(index + 1, end), context);
    index = end;
  }
  return output;
}

function evaluateExpression(expression: string, context: RichContext): string {
  const parts = splitTopLevel(expression, ":");
  const head = parts[0]?.trim() ?? "";
  const values = buildVarMap(context.card, context.upgraded);
  const currentValue = values.get(head);

  if (parts.length === 1) {
    if (head === "singleStarIcon") return "@@STAR:1@@";
    return formatResolvedValue(currentValue);
  }

  const modifier = parts[1]?.trim() ?? "";
  if (modifier === "diff()" || modifier === "") {
    return formatResolvedValue(currentValue);
  }

  if (modifier === "inverseDiff()") {
    if (typeof currentValue === "number") {
      return formatNumber(Math.abs(currentValue));
    }
    return "";
  }

  if (modifier === "plural") {
    const rawOptions = parts.slice(2).join(":");
    const [singular = "", plural = singular] = splitTopLevel(rawOptions, "|");
    const numericValue = typeof currentValue === "number" ? currentValue : 0;
    return resolveTemplateString(Math.abs(numericValue) === 1 ? singular : plural, context);
  }

  if (modifier.startsWith("energyIcons")) {
    const explicit = modifier.match(/\((\d+)\)/)?.[1];
    const value = explicit ? Number(explicit) : typeof currentValue === "number" ? currentValue : 0;
    return `@@ENERGY:${formatNumber(value)}@@`;
  }

  if (modifier.startsWith("starIcons")) {
    const explicit = modifier.match(/\((\d+)\)/)?.[1];
    const value = explicit ? Number(explicit) : typeof currentValue === "number" ? currentValue : 0;
    return `@@STAR:${formatNumber(value)}@@`;
  }

  if (modifier === "show") {
    const [whenTrue = "", whenFalse = ""] = splitTopLevel(parts.slice(2).join(":"), "|");
    const truthy = head === "IfUpgraded" ? context.upgraded : Boolean(currentValue);
    return resolveTemplateString(truthy ? whenTrue : whenFalse, context);
  }

  if (modifier.startsWith("choose(")) {
    const optionGroup = modifier.slice("choose(".length, -1);
    const options = splitTopLevel(optionGroup, "|");
    const outputs = splitTopLevel(parts.slice(2).join(":"), "|");
    const normalizedCurrent = normalizeChoiceToken(String(currentValue ?? ""));
    const index = options.findIndex((option) => normalizeChoiceToken(option) === normalizedCurrent);
    const fallback = outputs.at(-1) ?? "";
    return resolveTemplateString(index >= 0 ? outputs[index] ?? fallback : fallback, context);
  }

  if (modifier === "cond") {
    const raw = parts.slice(2).join(":");
    const match = raw.match(/^(>=|<=|>|<|==|!=)\s*(-?\d+(?:\.\d+)?)\?(.*)$/);
    if (!match) return "";
    const [, operator, targetRaw, branchesRaw] = match;
    const [whenTrue = "", whenFalse = ""] = splitTopLevel(branchesRaw, "|");
    const numericValue = typeof currentValue === "number" ? currentValue : 0;
    const targetValue = Number(targetRaw);
    const pass =
      operator === ">" ? numericValue > targetValue :
      operator === "<" ? numericValue < targetValue :
      operator === ">=" ? numericValue >= targetValue :
      operator === "<=" ? numericValue <= targetValue :
      operator === "==" ? numericValue === targetValue :
      numericValue !== targetValue;
    return resolveTemplateString(pass ? whenTrue : whenFalse, context);
  }

  const fallbackRaw = parts.slice(1).join(":");
  if (fallbackRaw.includes("|")) {
    const [whenTrue = "", whenFalse = ""] = splitTopLevel(fallbackRaw, "|");
    return resolveTemplateString(Boolean(currentValue) ? whenTrue : whenFalse, context);
  }

  return formatResolvedValue(currentValue);
}

function formatResolvedValue(value: string | number | boolean | undefined) {
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "1" : "";
  return value ?? "";
}

function escapeHtml(source: string) {
  return source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeResolvedText(source: string) {
  return source
    .replace(/\[E\]/g, "@@ENERGY:1@@")
    .replace(/\bNL\b/g, "\n");
}

function renderRichHtml(template: string, context: RichContext) {
  const resolved = normalizeResolvedText(resolveTemplateString(template, context));
  const escaped = escapeHtml(resolved)
    .replace(/\[gold\]/g, '<span class="compendium-rich compendium-rich--gold">')
    .replace(/\[blue\]/g, '<span class="compendium-rich compendium-rich--blue">')
    .replace(/\[purple\]/g, '<span class="compendium-rich compendium-rich--purple">')
    .replace(/\[\/gold\]|\[\/blue\]|\[\/purple\]/g, "</span>")
    .replace(/@@ENERGY:([^@]+)@@/g, '<span class="compendium-inline-token compendium-inline-token--energy">$1</span>')
    .replace(/@@STAR:([^@]+)@@/g, '<span class="compendium-inline-token compendium-inline-token--star">$1</span>')
    .replace(/\r?\n/g, "<br />");
  return { __html: escaped };
}

const EMPTY_CARD: CompendiumCardDto = {
  id: "",
  className: "",
  name: "",
  descriptionTemplate: "",
  character: null,
  typeName: "none",
  rarity: "none",
  target: "none",
  energy: 0,
  upgradable: false,
  vars: [],
  keywords: [],
  upgrade: { energyDelta: 0, varDeltas: {}, addedKeywords: [], removedKeywords: [] },
  artFilePath: null,
  nativeAssets: null,
};

function stripRichText(
  source: string,
  context: RichContext = { card: EMPTY_CARD, upgraded: false },
) {
  return normalizeResolvedText(resolveTemplateString(source, context))
    .replace(/\[[^\]]+\]/g, " ")
    .replace(/@@(?:ENERGY|STAR):([^@]+)@@/g, "$1")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function currentEnergy(card: CompendiumCardDto, upgraded: boolean) {
  return card.energy + (upgraded ? card.upgrade.energyDelta ?? 0 : 0);
}

function currentKeywords(card: CompendiumCardDto, upgraded: boolean) {
  const active = new Set(card.keywords);
  if (upgraded) {
    for (const keyword of card.upgrade.removedKeywords) active.delete(keyword);
    for (const keyword of card.upgrade.addedKeywords) active.add(keyword);
  }
  return Array.from(active);
}

function toErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function isMissingGameInstallError(message: string) {
  return message.toLowerCase().includes("game install not found");
}

function toLocalAssetUrl(path: string | null | undefined) {
  if (!path) {
    return null;
  }

  const cachedUrl = localAssetUrlCache.get(path);
  if (cachedUrl) {
    return cachedUrl;
  }

  const resolvedUrl = convertFileSrc(path);
  localAssetUrlCache.set(path, resolvedUrl);
  return resolvedUrl;
}

function loadNativeFontFaceOnce(family: string, sourceUrl: string) {
  const cacheKey = `${family}:${sourceUrl}`;
  const existing = loadedFontFaces.get(cacheKey);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    try {
      const face = new FontFace(family, `url("${sourceUrl}")`);
      await face.load();
      document.fonts.add(face);
      await document.fonts.load(`16px "${family}"`);
    } catch (error) {
      loadedFontFaces.delete(cacheKey);
      throw error;
    }
  })();

  loadedFontFaces.set(cacheKey, pending);
  return pending;
}

function toNativeFontUrls(nativeFonts: CompendiumNativeFontsDto | null | undefined) {
  if (!nativeFonts) {
    return null;
  }

  return {
    titleLatin: toLocalAssetUrl(nativeFonts.titleLatinFilePath),
    titleCjk: toLocalAssetUrl(nativeFonts.titleCjkFilePath),
  };
}

function supportsNativeCardFace(card: CompendiumCardDto) {
  return Boolean(
    card.nativeAssets &&
      card.nativeAssets.frameFilePath &&
      card.nativeAssets.bannerFilePath &&
      card.nativeAssets.typePlaqueFilePath &&
      card.nativeAssets.energyIconFilePath,
  );
}

function renderCachedCardRichHtml(card: CompendiumCardDto, upgraded: boolean) {
  let cacheEntry = cardRichHtmlCache.get(card);
  if (!cacheEntry) {
    cacheEntry = {};
    cardRichHtmlCache.set(card, cacheEntry);
  }

  if (upgraded) {
    if (!cacheEntry.upgraded) {
      cacheEntry.upgraded = renderRichHtml(card.descriptionTemplate, {
        card,
        upgraded: true,
      });
    }
    return cacheEntry.upgraded;
  }

  if (!cacheEntry.base) {
    cacheEntry.base = renderRichHtml(card.descriptionTemplate, {
      card,
      upgraded: false,
    });
  }
  return cacheEntry.base;
}

type CompendiumKeywordCatalog = NonNullable<CompendiumIndexDto["keywordCatalog"]>;

type CompendiumToolbarOption = {
  value: string;
  label: string;
  count: number;
};

type CompendiumFilterSelection = {
  character?: ReadonlySet<string>;
  type?: ReadonlySet<string>;
  rarity?: ReadonlySet<string>;
};

function toggleCompendiumFilterValue(current: string[], value: string) {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

function matchesCompendiumFilters(
  card: CompendiumCardDto,
  filters: CompendiumFilterSelection,
) {
  if (filters.character?.size && !filters.character.has(card.character ?? "none")) {
    return false;
  }
  if (filters.type?.size && !filters.type.has(card.typeName)) {
    return false;
  }
  if (filters.rarity?.size && !filters.rarity.has(card.rarity)) {
    return false;
  }
  return true;
}

function matchesCompendiumQuery(
  card: CompendiumCardDto,
  normalizedQuery: string,
  upgraded: boolean,
  keywordCatalog: CompendiumKeywordCatalog,
) {
  if (!normalizedQuery) {
    return true;
  }

  const keywordText = currentKeywords(card, upgraded)
    .map((keyword) => keywordCatalog[keyword]?.title ?? keyword)
    .join(" ");

  const haystack = [
    card.name,
    card.id,
    card.className,
    stripRichText(card.descriptionTemplate, { card, upgraded }),
    keywordText,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

export function CompendiumPage() {
  const { locale } = useI18n();
  const navigate = useNavigate();
  const resolvedLocale: "zh-CN" | "en-US" = locale === "en-US" ? "en-US" : "zh-CN";
  const copy = COPY[resolvedLocale];
  const characterLabels = CHARACTER_LABELS[resolvedLocale];
  const typeLabels = TYPE_LABELS[resolvedLocale];
  const rarityLabels = RARITY_LABELS[resolvedLocale];
  const targetLabels = TARGET_LABELS[resolvedLocale];

  const [index, setIndex] = useState<CompendiumIndexDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requiresGamePath, setRequiresGamePath] = useState(false);
  const [query, setQuery] = useState("");
  const [characterFilters, setCharacterFilters] = useState<string[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [rarityFilters, setRarityFilters] = useState<string[]>([]);
  const [upgraded, setUpgraded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCardCount, setVisibleCardCount] = useState(INITIAL_GALLERY_RENDER_COUNT);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let active = true;
    let frameId = 0;
    setLoading(true);
    setError(null);
    setRequiresGamePath(false);

    void getCompendiumIndex(resolvedLocale)
      .then((data) => {
        if (!active) return;
        frameId = window.requestAnimationFrame(() => {
          if (!active) return;
          startTransition(() => {
            setIndex(data);
            setRequiresGamePath(false);
            setSelectedId((current) => current ?? data.cards[0]?.id ?? null);
            setLoading(false);
          });
        });
      })
      .catch((reason) => {
        if (!active) return;
        const message = toErrorMessage(reason);
        setRequiresGamePath(isMissingGameInstallError(message));
        setError(message);
        setLoading(false);
      });

    return () => {
      active = false;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [resolvedLocale]);

  const cards = index?.cards ?? [];
  const keywordCatalog: CompendiumKeywordCatalog = index?.keywordCatalog ?? {};
  const nativeFontUrls = useMemo(() => toNativeFontUrls(index?.nativeFonts), [index?.nativeFonts]);
  const normalizedQuery = useMemo(() => deferredQuery.trim().toLowerCase(), [deferredQuery]);
  const selectedCharacterFilters = useMemo(() => new Set(characterFilters), [characterFilters]);
  const selectedTypeFilters = useMemo(() => new Set(typeFilters), [typeFilters]);
  const selectedRarityFilters = useMemo(() => new Set(rarityFilters), [rarityFilters]);

  useEffect(() => {
    if (!nativeFontUrls || typeof FontFace === "undefined") {
      return;
    }

    const tasks: Promise<void>[] = [];
    if (nativeFontUrls.titleLatin) {
      tasks.push(loadNativeFontFaceOnce(NATIVE_TITLE_LATIN_FONT_FAMILY, nativeFontUrls.titleLatin));
    }
    if (nativeFontUrls.titleCjk) {
      tasks.push(loadNativeFontFaceOnce(NATIVE_TITLE_CJK_FONT_FAMILY, nativeFontUrls.titleCjk));
    }

    if (!tasks.length) {
      return;
    }

    Promise.all(tasks).catch((reason) => {
      console.warn("Failed to load native compendium fonts", reason);
    });
  }, [nativeFontUrls]);

  const filteredCards = useMemo(
    () =>
      cards.filter((card) => {
        if (!matchesCompendiumFilters(card, {
          character: selectedCharacterFilters,
          type: selectedTypeFilters,
          rarity: selectedRarityFilters,
        })) {
          return false;
        }

        return matchesCompendiumQuery(card, normalizedQuery, upgraded, keywordCatalog);
      }),
    [
      cards,
      keywordCatalog,
      normalizedQuery,
      selectedCharacterFilters,
      selectedRarityFilters,
      selectedTypeFilters,
      upgraded,
    ],
  );

  useEffect(() => {
    if (!filteredCards.length) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !filteredCards.some((card) => card.id === selectedId)) {
      setSelectedId(filteredCards[0].id);
    }
  }, [filteredCards, selectedId]);

  const selectedCard = useMemo(
    () => filteredCards.find((card) => card.id === selectedId) ?? filteredCards[0] ?? null,
    [filteredCards, selectedId],
  );

  useEffect(() => {
    if (selectedCard && !selectedCard.upgradable && upgraded) {
      setUpgraded(false);
    }
  }, [selectedCard, upgraded]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    const requestIdle = window.requestIdleCallback?.bind(window);
    const cancelIdle = window.cancelIdleCallback?.bind(window);

    const totalCards = filteredCards.length;
    const initialVisibleCards = Math.min(totalCards, INITIAL_GALLERY_RENDER_COUNT);
    setVisibleCardCount(initialVisibleCards);

    if (totalCards <= initialVisibleCards) {
      return () => {
        cancelled = true;
      };
    }

    const scheduleNextBatch = () => {
      if (cancelled) {
        return;
      }

      if (requestIdle) {
        idleId = requestIdle(
          () => {
            if (cancelled) {
              return;
            }

            startTransition(() => {
              setVisibleCardCount((current) => {
                const nextCount = Math.min(totalCards, current + GALLERY_RENDER_BATCH_SIZE);
                if (nextCount < totalCards) {
                  scheduleNextBatch();
                }
                return nextCount;
              });
            });
          },
          { timeout: GALLERY_IDLE_TIMEOUT },
        );
        return;
      }

      timeoutId = setTimeout(() => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setVisibleCardCount((current) => {
            const nextCount = Math.min(totalCards, current + GALLERY_RENDER_BATCH_SIZE);
            if (nextCount < totalCards) {
              scheduleNextBatch();
            }
            return nextCount;
          });
        });
      }, 32);
    };

    scheduleNextBatch();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      if (idleId !== null && cancelIdle) {
        cancelIdle(idleId);
      }
    };
  }, [filteredCards]);

  const characterCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const card of cards) {
      if (!matchesCompendiumFilters(card, { type: selectedTypeFilters, rarity: selectedRarityFilters })) {
        continue;
      }
      if (!matchesCompendiumQuery(card, normalizedQuery, upgraded, keywordCatalog)) {
        continue;
      }

      const value = card.character ?? "none";
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return counts;
  }, [cards, keywordCatalog, normalizedQuery, selectedRarityFilters, selectedTypeFilters, upgraded]);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const card of cards) {
      if (!matchesCompendiumFilters(card, { character: selectedCharacterFilters, rarity: selectedRarityFilters })) {
        continue;
      }
      if (!matchesCompendiumQuery(card, normalizedQuery, upgraded, keywordCatalog)) {
        continue;
      }

      counts.set(card.typeName, (counts.get(card.typeName) ?? 0) + 1);
    }
    return counts;
  }, [cards, keywordCatalog, normalizedQuery, selectedCharacterFilters, selectedRarityFilters, upgraded]);

  const rarityCounts = useMemo(() => {
    const counts = new Map<string, number>();

    for (const card of cards) {
      if (!matchesCompendiumFilters(card, { character: selectedCharacterFilters, type: selectedTypeFilters })) {
        continue;
      }
      if (!matchesCompendiumQuery(card, normalizedQuery, upgraded, keywordCatalog)) {
        continue;
      }

      counts.set(card.rarity, (counts.get(card.rarity) ?? 0) + 1);
    }
    return counts;
  }, [cards, keywordCatalog, normalizedQuery, selectedCharacterFilters, selectedTypeFilters, upgraded]);

  const characterOptions = useMemo<CompendiumToolbarOption[]>(() => {
    const values = Array.from(new Set(cards.map((card) => card.character ?? "none"))).sort();
    return values.map((value) => ({
      value,
      label: characterLabels[value as keyof typeof characterLabels] ?? value,
      count: characterCounts.get(value) ?? 0,
    }));
  }, [cards, characterCounts, characterLabels]);

  const typeOptions = useMemo<CompendiumToolbarOption[]>(() => {
    const values = Array.from(new Set(cards.map((card) => card.typeName))).sort();
    return values.map((value) => ({
      value,
      label: typeLabels[value as keyof typeof typeLabels] ?? value,
      count: typeCounts.get(value) ?? 0,
    }));
  }, [cards, typeCounts, typeLabels]);

  const rarityOptions = useMemo<CompendiumToolbarOption[]>(() => {
    const values = Array.from(new Set(cards.map((card) => card.rarity))).sort();
    return values.map((value) => ({
      value,
      label: rarityLabels[value as keyof typeof rarityLabels] ?? value,
      count: rarityCounts.get(value) ?? 0,
    }));
  }, [cards, rarityCounts, rarityLabels]);

  async function handleRefresh() {
    setRefreshing(true);
    setError(null);
    setRequiresGamePath(false);
    try {
      const detected = await detectGameInstall();
      if (detected?.rootDir && detected.detectedBy !== "config") {
        await updateGameRootDir(detected.rootDir);
      }
      const data = await getCompendiumIndex(resolvedLocale, true);
      setIndex(data);
      setRequiresGamePath(false);
      setSelectedId((current) => current ?? data.cards[0]?.id ?? null);
    } catch (reason) {
      const message = toErrorMessage(reason);
      setRequiresGamePath(isMissingGameInstallError(message));
      setError(message);
    } finally {
      setRefreshing(false);
    }
  }

  const selectedCharacterLabel = selectedCard
    ? (characterLabels[(selectedCard.character ?? "none") as keyof typeof characterLabels] ??
      selectedCard.character ??
      "-")
    : "-";
  const selectedTypeLabel = selectedCard
    ? (typeLabels[selectedCard.typeName as keyof typeof typeLabels] ?? selectedCard.typeName)
    : "-";
  const selectedRarityLabel = selectedCard
    ? (rarityLabels[selectedCard.rarity as keyof typeof rarityLabels] ?? selectedCard.rarity)
    : "-";
  const selectedTargetLabel = selectedCard
    ? (targetLabels[selectedCard.target as keyof typeof targetLabels] ?? selectedCard.target)
    : "-";
  const selectedEnergy = selectedCard ? formatNumber(currentEnergy(selectedCard, upgraded)) : "-";
  const selectedKeywords = selectedCard ? currentKeywords(selectedCard, upgraded) : [];
  const selectedSummary = selectedCard
    ? stripRichText(selectedCard.descriptionTemplate, { card: selectedCard, upgraded })
    : copy.detailHint;
  const selectedIndex = selectedCard
    ? filteredCards.findIndex((card) => card.id === selectedCard.id)
    : -1;
  const selectedPosition = selectedIndex >= 0 ? selectedIndex + 1 : 0;
  const selectedSerial = `${copy.cardSerial} ${String(selectedPosition).padStart(3, "0")} / ${String(
    filteredCards.length,
  ).padStart(3, "0")}`;
  const rarityTone: "neutral" | "accent" | "warning" =
    selectedCard?.rarity === "rare" || selectedCard?.rarity === "ancient"
      ? "warning"
      : selectedCard?.rarity === "uncommon"
        ? "accent"
        : "neutral";
  const errorTitle = requiresGamePath ? copy.gamePathRequiredTitle : copy.refreshError;
  const errorDescription = requiresGamePath ? copy.gamePathRequiredHint : error;

  const selectedUpgradeEntries = useMemo(() => {
    if (!selectedCard) return [];

    const entries: Array<{ key: string; label: string; value: string }> = [];

    if (selectedCard.upgrade.energyDelta !== 0) {
      entries.push({
        key: "energy",
        label: copy.cost,
        value: `${selectedCard.upgrade.energyDelta > 0 ? "+" : ""}${formatNumber(selectedCard.upgrade.energyDelta)}`,
      });
    }

    for (const item of selectedCard.vars) {
      const delta = selectedCard.upgrade.varDeltas[item.key];
      if (!delta) continue;
      entries.push({
        key: `var:${item.key}`,
        label: item.key,
        value: `${delta > 0 ? "+" : ""}${formatNumber(delta)}`,
      });
    }

    for (const keyword of selectedCard.upgrade.addedKeywords) {
      entries.push({
        key: `add:${keyword}`,
        label: `+ ${keywordCatalog[keyword]?.title ?? keyword}`,
        value: copy.upgradeKeyword,
      });
    }

    for (const keyword of selectedCard.upgrade.removedKeywords) {
      entries.push({
        key: `remove:${keyword}`,
        label: `- ${keywordCatalog[keyword]?.title ?? keyword}`,
        value: copy.upgradeKeyword,
      });
    }

    return entries;
  }, [copy.cost, copy.upgradeKeyword, keywordCatalog, selectedCard]);

  const galleryCards = useMemo(() => {
    const minimumVisibleCount = selectedIndex >= 0 ? selectedIndex + 1 : 0;
    return filteredCards.slice(0, Math.max(visibleCardCount, minimumVisibleCount));
  }, [filteredCards, selectedIndex, visibleCardCount]);

  const toolbarFilterGroups = [
    {
      key: "character",
      title: copy.character,
      values: selectedCharacterFilters,
      options: characterOptions,
      onToggle: (value: string) => setCharacterFilters((current) => toggleCompendiumFilterValue(current, value)),
    },
    {
      key: "type",
      title: copy.type,
      values: selectedTypeFilters,
      options: typeOptions,
      onToggle: (value: string) => setTypeFilters((current) => toggleCompendiumFilterValue(current, value)),
    },
    {
      key: "rarity",
      title: copy.rarity,
      values: selectedRarityFilters,
      options: rarityOptions,
      onToggle: (value: string) => setRarityFilters((current) => toggleCompendiumFilterValue(current, value)),
    },
  ];

  function renderLegacyCardFace(card: CompendiumCardDto, variant: "gallery" | "spotlight") {
    const artUrl = toLocalAssetUrl(card.artFilePath);
    const cardTypeLabel =
      typeLabels[card.typeName as keyof typeof typeLabels] ?? card.typeName;
    const cardEnergy = formatNumber(currentEnergy(card, upgraded));

    return (
      <div className={`compendium-card-face compendium-card-face--${variant} compendium-card-face--${card.typeName}`}>
        <div className="compendium-card-face__shell">
          <div className="compendium-card-face__cost">{cardEnergy}</div>
          <div className="compendium-card-face__title-band">
            <span>{card.name}</span>
          </div>
          <div className="compendium-card-face__art-window">
            {artUrl ? (
              <img
                src={artUrl}
                alt={card.name}
                className="compendium-card-face__art"
                loading={variant === "gallery" ? "lazy" : undefined}
              />
            ) : (
              <div className="compendium-card-face__placeholder">{copy.noArt}</div>
            )}
            <div className="compendium-card-face__art-glow" aria-hidden="true" />
          </div>
          <div className="compendium-card-face__type-plate">{cardTypeLabel}</div>
          <div className="compendium-card-face__body">
            <div
              className="compendium-card-face__description"
              dangerouslySetInnerHTML={renderCachedCardRichHtml(card, upgraded)}
            />
          </div>
        </div>
      </div>
    );
  }

  function renderNativeCardFace(
    card: CompendiumCardDto,
    variant: "gallery" | "spotlight",
    nativeAssets: CompendiumCardNativeAssetsDto,
  ) {
    const artUrl = toLocalAssetUrl(card.artFilePath);
    const frameUrl = toLocalAssetUrl(nativeAssets.frameFilePath);
    const bannerUrl = toLocalAssetUrl(nativeAssets.bannerFilePath);
    const portraitBorderUrl = toLocalAssetUrl(nativeAssets.portraitBorderFilePath);
    const typePlaqueUrl = toLocalAssetUrl(nativeAssets.typePlaqueFilePath);
    const energyIconUrl = toLocalAssetUrl(nativeAssets.energyIconFilePath);
    const cardTypeLabel =
      typeLabels[card.typeName as keyof typeof typeLabels] ?? card.typeName;
    const cardEnergy = formatNumber(currentEnergy(card, upgraded));

    return (
      <div
        className={`compendium-card-face compendium-card-face--native compendium-card-face--${variant} compendium-card-face--${card.typeName}`}
      >
        <div className="compendium-native-card__art-shell">
          {artUrl ? (
            <img
              src={artUrl}
              alt={card.name}
              className="compendium-native-card__art"
              loading={variant === "gallery" ? "lazy" : undefined}
            />
            ) : (
              <div className="compendium-native-card__art-placeholder">{copy.noArt}</div>
            )}
        </div>

        {frameUrl ? (
          <img className="compendium-native-card__frame" src={frameUrl} alt="" aria-hidden="true" />
        ) : null}

        <div className="compendium-native-card__description">
          <div
            dangerouslySetInnerHTML={renderCachedCardRichHtml(card, upgraded)}
          />
        </div>

        {portraitBorderUrl ? (
          <img
            className="compendium-native-card__portrait-border"
            src={portraitBorderUrl}
            alt=""
            aria-hidden="true"
          />
        ) : null}

        {bannerUrl ? (
          <img className="compendium-native-card__banner" src={bannerUrl} alt="" aria-hidden="true" />
        ) : null}

        <div className="compendium-native-card__title">
          <span>{card.name}</span>
        </div>

        <div className="compendium-native-card__type">
          {typePlaqueUrl ? (
            <img
              className="compendium-native-card__type-plaque"
              src={typePlaqueUrl}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          <span>{cardTypeLabel}</span>
        </div>

        <div className="compendium-native-card__energy">
          {energyIconUrl ? (
            <img
              className="compendium-native-card__energy-icon"
              src={energyIconUrl}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          <span>{cardEnergy}</span>
        </div>
      </div>
    );
  }

  function renderCardFace(card: CompendiumCardDto, variant: "gallery" | "spotlight") {
    if (supportsNativeCardFace(card) && card.nativeAssets) {
      return renderNativeCardFace(card, variant, card.nativeAssets);
    }
    return renderLegacyCardFace(card, variant);
  }

  return (
    <section className="page compendium-page">
      <PageHeader
        title={copy.title}
        description={copy.description}
        action={
          <div className="compendium-header">
            {index?.stale ? <StatusBadge tone="warning">{copy.stale}</StatusBadge> : null}
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void handleRefresh()}
              disabled={loading || refreshing}
            >
              <RefreshCw size={14} className={refreshing ? "spin-icon" : ""} />
              {copy.refresh}
            </button>
          </div>
        }
      />

      {!index && loading ? (
        <div className="panel compendium-state">
          <div className="compendium-state__icon">
            <BookImage size={22} />
          </div>
          <strong>{copy.loading}</strong>
          <span>{copy.loadingHint}</span>
        </div>
      ) : !index && error ? (
        <div className="panel compendium-state compendium-state--error">
          <div className="compendium-state__icon">
            <AlertTriangle size={22} />
          </div>
          <strong>{errorTitle}</strong>
          <span>{errorDescription}</span>
          <div className="compendium-state__actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
            >
              <RefreshCw size={14} className={refreshing ? "spin-icon" : ""} />
              {copy.refresh}
            </button>
            {requiresGamePath ? (
              <button
                type="button"
                className="button button--ghost"
                onClick={() => navigate("/settings")}
              >
                {copy.openSettings}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <section className="panel compendium-toolbar">
            <div className="compendium-toolbar__search">
              <Search size={16} />
              <input
                className="input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
              />
            </div>

            <div className="compendium-toolbar__filter-groups">
              {toolbarFilterGroups.map((group) => (
                <div
                  key={group.key}
                  className={`compendium-filter-group${group.values.size ? " is-active" : ""}`}
                >
                  <div className="compendium-filter-group__header">
                    <span className="compendium-filter-group__title">{group.title}</span>
                  </div>
                  <div className="compendium-filter-group__options">
                    {group.options.map((option) => {
                      const isActive = group.values.has(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`compendium-filter-option${isActive ? " is-active" : ""}`}
                          onClick={() => group.onToggle(option.value)}
                          aria-pressed={isActive}
                          disabled={!isActive && option.count === 0}
                        >
                          <span className="compendium-filter-option__label">{option.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {error || index?.stale ? (
            <section
              className={`panel compendium-notice${requiresGamePath ? " compendium-notice--actionable" : ""}`}
            >
              <div className="compendium-notice__copy">
                <AlertTriangle size={16} />
                <span>{requiresGamePath ? copy.gamePathRequiredHint : error ? `${copy.refreshError}: ${error}` : copy.staleHint}</span>
              </div>
              {requiresGamePath ? (
                <button
                  type="button"
                  className="button button--ghost button--compact"
                  onClick={() => navigate("/settings")}
                >
                  {copy.openSettings}
                </button>
              ) : null}
            </section>
          ) : null}

          <div className="compendium-layout">
            <section className="panel compendium-gallery">
              <div className="compendium-gallery__header">
                <div className="compendium-gallery__titles">
                  <span className="compendium-section-label">{copy.nav}</span>
                  <strong>{`${filteredCards.length} / ${cards.length} ${copy.cards}`}</strong>
                </div>
                <div className="compendium-gallery__header-meta">
                  <StatusBadge tone="neutral">
                    {selectedCard ? `#${String(selectedPosition).padStart(3, "0")}` : copy.empty}
                  </StatusBadge>
                  <StatusBadge tone="accent">{index?.gameVersion ?? "-"}</StatusBadge>
                </div>
              </div>

              {filteredCards.length ? (
                <MagicBento
                  items={galleryCards}
                  getItemKey={(card) => card.id}
                  renderItem={(card) => renderCardFace(card, "gallery")}
                  onItemClick={(card) => setSelectedId(card.id)}
                  isItemActive={(card) => card.id === selectedCard?.id}
                  getItemAriaLabel={(card) => card.name}
                  className="compendium-gallery__grid"
                  itemClassName="compendium-card"
                  textAutoHide={true}
                  enableStars={true}
                  enableSpotlight={true}
                  enableBorderGlow={true}
                  enableTilt={true}
                  enableMagnetism={false}
                  clickEffect={true}
                  spotlightRadius={220}
                  particleCount={6}
                  glowColor="232, 175, 82"
                />
              ) : (
                <div className="compendium-empty">{copy.empty}</div>
              )}
            </section>

            <aside className="compendium-detail-rail">
              <section className="panel compendium-inspector">
                {selectedCard ? (
                  <>
                    <div className="compendium-inspector__stage">
                      <div className="compendium-inspector__visual">
                        <div className="compendium-inspector__card">
                          {renderCardFace(selectedCard, "spotlight")}
                        </div>
                      </div>

                      <div className="compendium-inspector__hero">
                        <div className="compendium-inspector__hero-top">
                          <div className="compendium-inspector__hero-copy">
                            <span className="compendium-inspector__eyebrow">{selectedSerial}</span>
                            <h2>{selectedCard.name}</h2>
                          </div>

                          <div className="compendium-toggle compendium-toggle--detail">
                            <button
                              type="button"
                              className={`button button--secondary compendium-toggle__button${!upgraded ? " is-active" : ""}`}
                              onClick={() => setUpgraded(false)}
                            >
                              {copy.baseView}
                            </button>
                            <button
                              type="button"
                              disabled={!selectedCard.upgradable}
                              className={`button button--secondary compendium-toggle__button${upgraded ? " is-active" : ""}`}
                              onClick={() => setUpgraded(true)}
                            >
                              <Sparkles size={14} />
                              {copy.upgradedView}
                            </button>
                          </div>
                        </div>

                        <p className="compendium-inspector__lead">{selectedSummary}</p>
                        <div className="compendium-inspector__badges">
                          <StatusBadge tone="accent">{selectedCharacterLabel}</StatusBadge>
                          <StatusBadge tone={rarityTone}>{selectedRarityLabel}</StatusBadge>
                          <StatusBadge tone="neutral">{selectedTypeLabel}</StatusBadge>
                          <StatusBadge tone={upgraded ? "success" : "neutral"}>
                            {upgraded ? copy.upgradedView : copy.baseView}
                          </StatusBadge>
                        </div>
                      </div>
                    </div>

                    <div className="compendium-stats">
                      <div>
                        <span>{copy.cost}</span>
                        <strong>{selectedEnergy}</strong>
                      </div>
                      <div>
                        <span>{copy.target}</span>
                        <strong>{selectedTargetLabel}</strong>
                      </div>
                      <div>
                        <span>{copy.rarity}</span>
                        <strong>{selectedRarityLabel}</strong>
                      </div>
                      <div>
                        <span>{copy.type}</span>
                        <strong>{selectedTypeLabel}</strong>
                      </div>
                      <div>
                        <span>{copy.character}</span>
                        <strong>{selectedCharacterLabel}</strong>
                      </div>
                      <div>
                        <span>{copy.id}</span>
                        <strong>{selectedCard.id}</strong>
                      </div>
                      <div>
                        <span>{copy.className}</span>
                        <strong>{selectedCard.className}</strong>
                      </div>
                    </div>

                    <div className="compendium-detail-block">
                      <div className="compendium-detail-block__title">{copy.cardText}</div>
                      <div
                        className="compendium-description"
                        dangerouslySetInnerHTML={renderRichHtml(selectedCard.descriptionTemplate, {
                          card: selectedCard,
                          upgraded,
                        })}
                      />
                    </div>

                    <div className="compendium-detail-block">
                      <div className="compendium-detail-block__title">{copy.keywords}</div>
                      {selectedKeywords.length ? (
                        <div className="compendium-keywords">
                          {selectedKeywords.map((keyword) => {
                            const definition = keywordCatalog[keyword];
                            return (
                              <article key={keyword} className="compendium-keyword">
                                <strong>{definition?.title ?? keyword}</strong>
                                <div
                                  dangerouslySetInnerHTML={renderRichHtml(
                                    definition?.description ?? keyword,
                                    {
                                      card: selectedCard,
                                      upgraded,
                                    },
                                  )}
                                />
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="compendium-empty-inline">{copy.noKeywords}</div>
                      )}
                    </div>

                    <div className="compendium-detail-block">
                      <div className="compendium-detail-block__title">{copy.upgrades}</div>
                      {selectedCard.upgradable ? (
                        selectedUpgradeEntries.length ? (
                          <div className="compendium-upgrade-list">
                            {selectedUpgradeEntries.map((entry) => (
                              <article key={entry.key} className="compendium-upgrade-item">
                                <strong>{entry.label}</strong>
                                <span>{entry.value}</span>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="compendium-empty-inline">{copy.noUpgradeDelta}</div>
                        )
                      ) : (
                        <div className="compendium-empty-inline">{copy.notUpgradable}</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="compendium-empty">{copy.detailHint}</div>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
