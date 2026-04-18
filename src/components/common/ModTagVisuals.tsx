import type { ComponentType } from "react";
import {
  Boxes,
  Gauge,
  Gamepad2,
  Heart,
  LayoutGrid,
  Scale,
  Sparkles,
  Tag,
  Users,
  Wrench,
  type LucideProps,
} from "lucide-react";
import type { PresetModTagId } from "../../lib/modTags";

const PRESET_TAG_ICON_BY_ID: Record<PresetModTagId, ComponentType<LucideProps>> = {
  "visual-enhancement": Sparkles,
  "gameplay-expansion": Gamepad2,
  "utility-tools": Wrench,
  "ui-polish": LayoutGrid,
  "balance-tweaks": Scale,
  "performance-fixes": Gauge,
  "quality-of-life": Heart,
  "multiplayer-related": Users,
  "framework-dependency": Boxes,
};

type PresetModTagIconProps = LucideProps & {
  tagId: PresetModTagId;
};

export function PresetModTagIcon({ tagId, ...props }: PresetModTagIconProps) {
  const Icon = PRESET_TAG_ICON_BY_ID[tagId];
  return <Icon aria-hidden="true" {...props} />;
}

export function CustomModTagIcon(props: LucideProps) {
  return <Tag aria-hidden="true" {...props} />;
}

export function formatCustomTagLabel(tag: string) {
  return tag.trim().replace(/^#+\s*/, "");
}
