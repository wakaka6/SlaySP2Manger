import type { MessageKey } from "../i18n/messages";

const MOD_TAGS_STORAGE_KEY = "slaysp2_mod_tags";
const LEGACY_MOD_NOTES_STORAGE_KEY = "slaysp2_mod_notes";

export type PresetModTagId =
  | "visual-enhancement"
  | "gameplay-expansion"
  | "utility-tools"
  | "ui-polish"
  | "balance-tweaks"
  | "performance-fixes"
  | "quality-of-life"
  | "multiplayer-related"
  | "framework-dependency";

export type ModTagMap = Record<string, StoredModTagState>;

export type StoredModTagState = {
  preset: PresetModTagId[];
  custom: string[];
};

export type ModTagCount = {
  value: string;
  count: number;
};

export const PRESET_MOD_TAGS: ReadonlyArray<{
  id: PresetModTagId;
  messageKey: MessageKey;
}> = [
  { id: "visual-enhancement", messageKey: "modTags.preset.visualEnhancement" },
  { id: "gameplay-expansion", messageKey: "modTags.preset.gameplayExpansion" },
  { id: "utility-tools", messageKey: "modTags.preset.utilityTools" },
  { id: "ui-polish", messageKey: "modTags.preset.uiPolish" },
  { id: "balance-tweaks", messageKey: "modTags.preset.balanceTweaks" },
  { id: "performance-fixes", messageKey: "modTags.preset.performanceFixes" },
  { id: "quality-of-life", messageKey: "modTags.preset.qualityOfLife" },
  { id: "multiplayer-related", messageKey: "modTags.preset.multiplayerRelated" },
  { id: "framework-dependency", messageKey: "modTags.preset.frameworkDependency" },
];

const PRESET_MOD_TAG_ID_SET = new Set<string>(PRESET_MOD_TAGS.map((item) => item.id));

function createEmptyStoredModTagState(): StoredModTagState {
  return { preset: [], custom: [] };
}

function normalizeModStorageKey(modId: string) {
  return modId.trim().toLowerCase();
}

function normalizeCustomTag(tag: string) {
  return tag.trim().replace(/^#+\s*/, "").replace(/\s+/g, " ");
}

function dedupePresetTagIds(tagIds: PresetModTagId[]) {
  const unique: PresetModTagId[] = [];
  const seen = new Set<string>();

  for (const tagId of tagIds) {
    if (seen.has(tagId)) {
      continue;
    }

    seen.add(tagId);
    unique.push(tagId);
  }

  return unique;
}

function dedupeCustomTags(tags: string[]) {
  const unique: string[] = [];
  const seen = new Set<string>();

  for (const tag of tags) {
    const normalized = normalizeCustomTag(tag);
    const compareKey = normalized.toLowerCase();
    if (!normalized || seen.has(compareKey)) {
      continue;
    }

    seen.add(compareKey);
    unique.push(normalized);
  }

  return unique;
}

function normalizePresetTagId(value: unknown): PresetModTagId | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!PRESET_MOD_TAG_ID_SET.has(normalized)) {
    return null;
  }

  return normalized as PresetModTagId;
}

function normalizeStoredTagValue(value: unknown): StoredModTagState {
  if (typeof value === "string") {
    return {
      preset: [],
      custom: dedupeCustomTags([value]),
    };
  }

  if (Array.isArray(value)) {
    return {
      preset: [],
      custom: dedupeCustomTags(value.filter((item): item is string => typeof item === "string")),
    };
  }

  if (value && typeof value === "object") {
    const record = value as { preset?: unknown; custom?: unknown };
    const preset = Array.isArray(record.preset)
      ? dedupePresetTagIds(
          record.preset
            .map((item) => normalizePresetTagId(item))
            .filter((item): item is PresetModTagId => item !== null),
        )
      : [];
    const custom = Array.isArray(record.custom)
      ? dedupeCustomTags(record.custom.filter((item): item is string => typeof item === "string"))
      : [];

    return { preset, custom };
  }

  return createEmptyStoredModTagState();
}

function hasStoredTags(state: StoredModTagState) {
  return state.preset.length > 0 || state.custom.length > 0;
}

function parseStoredMap(raw: string | null): ModTagMap {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalized: ModTagMap = {};

    for (const [key, value] of Object.entries(parsed)) {
      const normalizedKey = normalizeModStorageKey(key);
      const state = normalizeStoredTagValue(value);
      if (normalizedKey && hasStoredTags(state)) {
        normalized[normalizedKey] = state;
      }
    }

    return normalized;
  } catch {
    return {};
  }
}

function writeStoredMap(tags: ModTagMap) {
  const compact: ModTagMap = {};

  for (const [key, value] of Object.entries(tags)) {
    if (hasStoredTags(value)) {
      compact[key] = {
        preset: dedupePresetTagIds(value.preset),
        custom: dedupeCustomTags(value.custom),
      };
    }
  }

  localStorage.setItem(MOD_TAGS_STORAGE_KEY, JSON.stringify(compact));
}

function updateModTagState(
  modId: string,
  updater: (current: StoredModTagState) => StoredModTagState,
): ModTagMap {
  const tags = loadModTags();
  const normalizedKey = normalizeModStorageKey(modId);
  const current = getModTagState(tags, modId);
  const next = updater(current);

  if (hasStoredTags(next)) {
    tags[normalizedKey] = {
      preset: dedupePresetTagIds(next.preset),
      custom: dedupeCustomTags(next.custom),
    };
  } else {
    delete tags[normalizedKey];
  }

  writeStoredMap(tags);
  return tags;
}

export function loadModTags(): ModTagMap {
  const current = parseStoredMap(localStorage.getItem(MOD_TAGS_STORAGE_KEY));
  if (Object.keys(current).length > 0) {
    return current;
  }

  const legacy = parseStoredMap(localStorage.getItem(LEGACY_MOD_NOTES_STORAGE_KEY));
  if (Object.keys(legacy).length > 0) {
    writeStoredMap(legacy);
    return legacy;
  }

  return {};
}

export function saveModTags(tags: ModTagMap) {
  writeStoredMap(tags);
}

export function getModTagState(tags: ModTagMap, modId: string): StoredModTagState {
  return tags[normalizeModStorageKey(modId)] ?? createEmptyStoredModTagState();
}

export function getModPresetTagIds(tags: ModTagMap, modId: string): PresetModTagId[] {
  return getModTagState(tags, modId).preset;
}

export function getModCustomTags(tags: ModTagMap, modId: string): string[] {
  return getModTagState(tags, modId).custom;
}

export function addPresetModTag(modId: string, tagId: PresetModTagId): ModTagMap {
  return updateModTagState(modId, (current) => ({
    ...current,
    preset: [...current.preset, tagId],
  }));
}

export function removePresetModTag(modId: string, tagId: PresetModTagId): ModTagMap {
  return updateModTagState(modId, (current) => ({
    ...current,
    preset: current.preset.filter((item) => item !== tagId),
  }));
}

export function addCustomModTag(modId: string, tag: string): ModTagMap {
  return updateModTagState(modId, (current) => ({
    ...current,
    custom: [...current.custom, tag],
  }));
}

export function removeCustomModTag(modId: string, tag: string): ModTagMap {
  const compareKey = normalizeCustomTag(tag).toLowerCase();
  return updateModTagState(modId, (current) => ({
    ...current,
    custom: current.custom.filter((item) => normalizeCustomTag(item).toLowerCase() !== compareKey),
  }));
}

export function renameCustomModTag(modId: string, fromTag: string, toTag: string): ModTagMap {
  const fromCompareKey = normalizeCustomTag(fromTag).toLowerCase();
  const nextValue = normalizeCustomTag(toTag);

  return updateModTagState(modId, (current) => ({
    ...current,
    custom: current.custom
      .map((item) => (normalizeCustomTag(item).toLowerCase() === fromCompareKey ? nextValue : item))
      .filter(Boolean),
  }));
}

export function buildPresetTagCounts(items: Array<{ id: string }>, tags: ModTagMap): Record<PresetModTagId, number> {
  const counts = Object.fromEntries(
    PRESET_MOD_TAGS.map((item) => [item.id, 0]),
  ) as Record<PresetModTagId, number>;

  for (const item of items) {
    for (const tagId of getModPresetTagIds(tags, item.id)) {
      counts[tagId] += 1;
    }
  }

  return counts;
}

export function buildCustomTagCounts(items: Array<{ id: string }>, tags: ModTagMap): ModTagCount[] {
  const counts = new Map<string, { value: string; count: number }>();

  for (const item of items) {
    for (const tag of getModCustomTags(tags, item.id)) {
      const compareKey = normalizeCustomTag(tag).toLowerCase();
      const existing = counts.get(compareKey);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(compareKey, { value: tag, count: 1 });
      }
    }
  }

  return Array.from(counts.values()).sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.value.localeCompare(right.value);
  });
}
