use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use image::{imageops::crop_imm, DynamicImage, ImageBuffer, ImageFormat, Rgba, RgbaImage};
use serde::Deserialize;
use tauri::{AppHandle, Manager};
use texture2ddecoder::decode_bc7;

use super::compendium_snapshot_runtime::write_snapshot_for_game_root;
use crate::app::state::AppSettings;
use crate::domain::compendium::{
    CompendiumCard, CompendiumCardNativeAssets, CompendiumIndex, CompendiumKeywordDefinition,
    CompendiumNativeFonts, CompendiumSnapshot, CompendiumSnapshotCard, CompendiumUpgrade,
    CompendiumVar,
};
use crate::services::game_service::GameService;

#[derive(Debug, Clone)]
pub struct CompendiumService {
    settings: AppSettings,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct ReleaseInfo {
    version: String,
    commit: Option<String>,
}

#[derive(Debug, Clone)]
struct AtlasTextureDescriptor {
    atlas_res_path: String,
    region: TextureRegion,
}

#[derive(Debug, Clone, Copy)]
struct TextureRegion {
    x: u32,
    y: u32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Copy)]
struct HsvMaterialParams {
    h: f32,
    s: f32,
    v: f32,
}

#[derive(Debug, Clone, Copy)]
struct NativeCardAssetRecipe {
    frame_texture_path: &'static str,
    frame_texture_key: &'static str,
    frame_material_path: &'static str,
    frame_material_key: &'static str,
    portrait_border_texture_path: Option<&'static str>,
    portrait_border_texture_key: Option<&'static str>,
    banner_texture_path: &'static str,
    banner_texture_key: &'static str,
    banner_material_path: &'static str,
    banner_material_key: &'static str,
    type_plaque_res_path: &'static str,
    type_plaque_key: &'static str,
    energy_icon_texture_path: &'static str,
    energy_icon_key: &'static str,
}

const TITLE_LATIN_FONT_RES_PATH: &str = "fonts/kreon_regular.ttf";
const TITLE_CJK_FONT_RES_PATH: &str = "fonts/zhs/SourceHanSerifSC-Medium.otf";

impl NativeCardAssetRecipe {
    fn from_card(card: &CompendiumSnapshotCard) -> Option<Self> {
        if card.rarity == "ancient" {
            return None;
        }

        let (frame_texture_path, frame_texture_key) = match card.type_name.as_str() {
            "attack" => (
                "images/atlases/ui_atlas.sprites/card/card_frame_attack_s.tres",
                "attack",
            ),
            "power" => (
                "images/atlases/ui_atlas.sprites/card/card_frame_power_s.tres",
                "power",
            ),
            "quest" => (
                "images/atlases/ui_atlas.sprites/card/card_frame_quest_s.tres",
                "quest",
            ),
            "skill" | "status" | "curse" => (
                "images/atlases/ui_atlas.sprites/card/card_frame_skill_s.tres",
                "skill",
            ),
            _ => return None,
        };

        let (portrait_border_texture_path, portrait_border_texture_key) =
            match card.type_name.as_str() {
                "attack" => (
                    Some("images/atlases/ui_atlas.sprites/card/card_portrait_border_attack_s.tres"),
                    Some("attack"),
                ),
                "power" => (
                    Some("images/atlases/ui_atlas.sprites/card/card_portrait_border_power_s.tres"),
                    Some("power"),
                ),
                "skill" | "status" | "curse" => (
                    Some("images/atlases/ui_atlas.sprites/card/card_portrait_border_skill_s.tres"),
                    Some("skill"),
                ),
                _ => (None, None),
            };

        let (frame_material_path, frame_material_key) = match card.rarity.as_str() {
            "curse" => ("materials/cards/frames/card_frame_curse_mat.tres", "curse"),
            "quest" => ("materials/cards/frames/card_frame_quest_mat.tres", "quest"),
            _ => match card.character.as_deref() {
                Some("ironclad") => ("materials/cards/frames/card_frame_red_mat.tres", "ironclad"),
                Some("silent") => ("materials/cards/frames/card_frame_green_mat.tres", "silent"),
                Some("defect") => ("materials/cards/frames/card_frame_blue_mat.tres", "defect"),
                Some("regent") => (
                    "materials/cards/frames/card_frame_orange_mat.tres",
                    "regent",
                ),
                Some("necrobinder") => (
                    "materials/cards/frames/card_frame_pink_mat.tres",
                    "necrobinder",
                ),
                Some("quest") => ("materials/cards/frames/card_frame_quest_mat.tres", "quest"),
                Some("curse") => ("materials/cards/frames/card_frame_curse_mat.tres", "curse"),
                _ => (
                    "materials/cards/frames/card_frame_colorless_mat.tres",
                    "colorless",
                ),
            },
        };

        let (banner_material_path, banner_material_key) = match card.rarity.as_str() {
            "basic" | "common" | "token" => (
                "materials/cards/banners/card_banner_common_mat.tres",
                "common",
            ),
            "uncommon" => (
                "materials/cards/banners/card_banner_uncommon_mat.tres",
                "uncommon",
            ),
            "rare" => ("materials/cards/banners/card_banner_rare_mat.tres", "rare"),
            "status" => (
                "materials/cards/banners/card_banner_status_mat.tres",
                "status",
            ),
            "curse" => (
                "materials/cards/banners/card_banner_curse_mat.tres",
                "curse",
            ),
            "event" => (
                "materials/cards/banners/card_banner_event_mat.tres",
                "event",
            ),
            "quest" => (
                "materials/cards/banners/card_banner_quest_mat.tres",
                "quest",
            ),
            _ => (
                "materials/cards/banners/card_banner_common_mat.tres",
                "common",
            ),
        };

        let (energy_icon_texture_path, energy_icon_key) = match card.character.as_deref() {
            Some("ironclad") => (
                "images/atlases/ui_atlas.sprites/card/energy_ironclad.tres",
                "ironclad",
            ),
            Some("silent") => (
                "images/atlases/ui_atlas.sprites/card/energy_silent.tres",
                "silent",
            ),
            Some("defect") => (
                "images/atlases/ui_atlas.sprites/card/energy_defect.tres",
                "defect",
            ),
            Some("regent") => (
                "images/atlases/ui_atlas.sprites/card/energy_regent.tres",
                "regent",
            ),
            Some("necrobinder") => (
                "images/atlases/ui_atlas.sprites/card/energy_necrobinder.tres",
                "necrobinder",
            ),
            Some("quest") => (
                "images/atlases/ui_atlas.sprites/card/energy_quest.tres",
                "quest",
            ),
            _ => (
                "images/atlases/ui_atlas.sprites/card/energy_colorless.tres",
                "colorless",
            ),
        };

        Some(Self {
            frame_texture_path,
            frame_texture_key,
            frame_material_path,
            frame_material_key,
            portrait_border_texture_path,
            portrait_border_texture_key,
            banner_texture_path: "images/atlases/ui_atlas.sprites/card/card_banner.tres",
            banner_texture_key: "card_banner",
            banner_material_path,
            banner_material_key,
            type_plaque_res_path: "images/ui/cards/card_portrait_border_plaque2.png",
            type_plaque_key: "type_plaque",
            energy_icon_texture_path,
            energy_icon_key,
        })
    }
}

struct NativeCardAssetExtractor<'a> {
    archive: &'a PckArchive,
    cache_dir: PathBuf,
    force_refresh: bool,
    decoded_images: HashMap<String, RgbaImage>,
    resolved_paths: HashMap<String, String>,
    material_cache: HashMap<String, HsvMaterialParams>,
}

impl<'a> NativeCardAssetExtractor<'a> {
    fn new(
        archive: &'a PckArchive,
        cache_dir: PathBuf,
        force_refresh: bool,
    ) -> Result<Self, String> {
        fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;
        Ok(Self {
            archive,
            cache_dir,
            force_refresh,
            decoded_images: HashMap::new(),
            resolved_paths: HashMap::new(),
            material_cache: HashMap::new(),
        })
    }

    fn materialize_for_card(
        &mut self,
        card: &CompendiumSnapshotCard,
    ) -> Result<Option<CompendiumCardNativeAssets>, String> {
        let Some(recipe) = NativeCardAssetRecipe::from_card(card) else {
            return Ok(None);
        };

        let frame_file_path = self.materialize_atlas_sprite(
            &format!(
                "frame_{}_{}.png",
                recipe.frame_texture_key, recipe.frame_material_key
            ),
            recipe.frame_texture_path,
            Some(recipe.frame_material_path),
        )?;
        let banner_file_path = self.materialize_atlas_sprite(
            &format!(
                "banner_{}_{}.png",
                recipe.banner_texture_key, recipe.banner_material_key
            ),
            recipe.banner_texture_path,
            Some(recipe.banner_material_path),
        )?;
        let portrait_border_file_path = match recipe.portrait_border_texture_path {
            Some(texture_path) => Some(self.materialize_atlas_sprite(
                &format!(
                    "portrait_border_{}_{}.png",
                    recipe.portrait_border_texture_key.unwrap_or("default"),
                    recipe.banner_material_key,
                ),
                texture_path,
                Some(recipe.banner_material_path),
            )?),
            None => None,
        };
        let type_plaque_file_path = self.materialize_res_image(
            &format!("{}.png", recipe.type_plaque_key),
            recipe.type_plaque_res_path,
        )?;
        let energy_icon_file_path = self.materialize_atlas_sprite(
            &format!("energy_{}.png", recipe.energy_icon_key),
            recipe.energy_icon_texture_path,
            None,
        )?;

        Ok(Some(CompendiumCardNativeAssets {
            frame_file_path,
            banner_file_path,
            portrait_border_file_path,
            type_plaque_file_path,
            energy_icon_file_path,
        }))
    }

    fn materialize_atlas_sprite(
        &mut self,
        output_name: &str,
        sprite_tres_path: &str,
        material_path: Option<&str>,
    ) -> Result<String, String> {
        let cache_key = format!("atlas:{sprite_tres_path}:{material_path:?}");
        if !self.force_refresh {
            if let Some(existing) = self.resolved_paths.get(&cache_key) {
                return Ok(existing.clone());
            }
        }

        let output_path = self.cache_dir.join(output_name);
        if !self.force_refresh && output_path.exists() {
            let resolved = output_path.to_string_lossy().to_string();
            self.resolved_paths.insert(cache_key, resolved.clone());
            return Ok(resolved);
        }

        let descriptor = self.read_atlas_texture_descriptor(sprite_tres_path)?;
        let atlas_image = self.load_res_image_rgba(&descriptor.atlas_res_path)?;
        let mut sprite = crop_imm(
            atlas_image,
            descriptor.region.x,
            descriptor.region.y,
            descriptor.region.width,
            descriptor.region.height,
        )
        .to_image();

        if let Some(material_path) = material_path {
            let params = self.read_hsv_material(material_path)?;
            apply_hsv_in_place(&mut sprite, params);
        }

        save_png(&output_path, &sprite)?;
        let resolved = output_path.to_string_lossy().to_string();
        self.resolved_paths.insert(cache_key, resolved.clone());
        Ok(resolved)
    }

    fn materialize_res_image(
        &mut self,
        output_name: &str,
        res_path: &str,
    ) -> Result<String, String> {
        let cache_key = format!("res:{res_path}");
        if !self.force_refresh {
            if let Some(existing) = self.resolved_paths.get(&cache_key) {
                return Ok(existing.clone());
            }
        }

        let output_path = self.cache_dir.join(output_name);
        if !self.force_refresh && output_path.exists() {
            let resolved = output_path.to_string_lossy().to_string();
            self.resolved_paths.insert(cache_key, resolved.clone());
            return Ok(resolved);
        }

        let image = self.load_res_image_rgba(res_path)?;
        save_png(&output_path, image)?;
        let resolved = output_path.to_string_lossy().to_string();
        self.resolved_paths.insert(cache_key, resolved.clone());
        Ok(resolved)
    }

    fn read_atlas_texture_descriptor(
        &mut self,
        sprite_tres_path: &str,
    ) -> Result<AtlasTextureDescriptor, String> {
        let text = self.archive.read_text(sprite_tres_path)?;
        let atlas_res_path = extract_resource_path(&text)
            .ok_or_else(|| format!("atlas resource path not found in {sprite_tres_path}"))?;
        let region = extract_rect2(&text, "region = Rect2(")
            .ok_or_else(|| format!("atlas region not found in {sprite_tres_path}"))?;
        Ok(AtlasTextureDescriptor {
            atlas_res_path,
            region,
        })
    }

    fn read_hsv_material(&mut self, material_path: &str) -> Result<HsvMaterialParams, String> {
        if let Some(params) = self.material_cache.get(material_path).copied() {
            return Ok(params);
        }

        let text = self.archive.read_text(material_path)?;
        let params = HsvMaterialParams {
            h: extract_float_assignment(&text, "shader_parameter/h = ").unwrap_or(1.0),
            s: extract_float_assignment(&text, "shader_parameter/s = ").unwrap_or(1.0),
            v: extract_float_assignment(&text, "shader_parameter/v = ").unwrap_or(1.0),
        };
        self.material_cache
            .insert(material_path.to_string(), params);
        Ok(params)
    }

    fn load_res_image_rgba(&mut self, res_path: &str) -> Result<&RgbaImage, String> {
        let imported_path = self.resolve_imported_texture_path(res_path)?;
        if !self.decoded_images.contains_key(&imported_path) {
            let bytes = self.archive.read_bytes(&imported_path)?;
            let image = decode_ctex_image(&bytes)?;
            self.decoded_images.insert(imported_path.clone(), image);
        }

        self.decoded_images
            .get(&imported_path)
            .ok_or_else(|| format!("decoded texture cache missing for {imported_path}"))
    }

    fn resolve_imported_texture_path(&mut self, res_path: &str) -> Result<String, String> {
        let import_path = format!("{}.import", res_path.trim_start_matches("res://"));
        let import_text = self.archive.read_text(&import_path)?;
        extract_imported_resource_path(&import_text)
            .ok_or_else(|| format!("imported texture path not found in {import_path}"))
    }
}

#[derive(Debug, Clone)]
struct PckEntry {
    offset: u64,
    size: u64,
}

struct PckArchive {
    path: PathBuf,
    entries: HashMap<String, PckEntry>,
}

impl PckArchive {
    fn open(path: &Path) -> Result<Self, String> {
        let mut file = File::open(path).map_err(|error| error.to_string())?;

        let mut magic = [0_u8; 4];
        file.read_exact(&mut magic)
            .map_err(|error| error.to_string())?;
        if &magic != b"GDPC" {
            return Err("unexpected PCK magic".to_string());
        }

        let _version = read_u32(&mut file)?;
        let _godot_major = read_u32(&mut file)?;
        let _godot_minor = read_u32(&mut file)?;
        let _godot_patch = read_u32(&mut file)?;
        let _flags = read_u32(&mut file)?;
        let file_base = read_u64(&mut file)?;
        let dir_offset = read_u64(&mut file)?;

        file.seek(SeekFrom::Start(dir_offset))
            .map_err(|error| error.to_string())?;
        let count = read_u32(&mut file)?;

        let mut entries = HashMap::new();
        for _ in 0..count {
            let name_len = read_u32(&mut file)? as usize;
            let mut name_bytes = vec![0_u8; name_len];
            file.read_exact(&mut name_bytes)
                .map_err(|error| error.to_string())?;
            let name = String::from_utf8_lossy(&name_bytes)
                .trim_end_matches('\0')
                .to_string();

            let entry_offset = read_u64(&mut file)?;
            let entry_size = read_u64(&mut file)?;
            file.seek(SeekFrom::Current(20))
                .map_err(|error| error.to_string())?;

            entries.insert(
                name,
                PckEntry {
                    offset: file_base + entry_offset,
                    size: entry_size,
                },
            );
        }

        Ok(Self {
            path: path.to_path_buf(),
            entries,
        })
    }

    fn read_bytes(&self, name: &str) -> Result<Vec<u8>, String> {
        let entry = self
            .entries
            .get(name)
            .ok_or_else(|| format!("missing PCK entry: {}", name))?
            .clone();
        let mut file = File::open(&self.path).map_err(|error| error.to_string())?;
        file.seek(SeekFrom::Start(entry.offset))
            .map_err(|error| error.to_string())?;
        let mut buffer = vec![0_u8; entry.size as usize];
        file.read_exact(&mut buffer)
            .map_err(|error| error.to_string())?;
        Ok(buffer)
    }

    fn read_text(&self, name: &str) -> Result<String, String> {
        String::from_utf8(self.read_bytes(name)?).map_err(|error| error.to_string())
    }
}

impl CompendiumService {
    pub fn new(settings: AppSettings) -> Self {
        Self { settings }
    }

    pub fn get_index(
        &self,
        app_handle: &AppHandle,
        locale: Option<String>,
        force_refresh: bool,
    ) -> Result<CompendiumIndex, String> {
        let install = GameService::new(self.settings.clone())
            .detect_install()
            .map_err(|error| error.to_string())?;

        let release: ReleaseInfo = serde_json::from_str(
            &fs::read_to_string(Path::new(&install.root_dir).join("release_info.json"))
                .map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;

        let app_cache_dir = app_handle
            .path()
            .app_cache_dir()
            .map_err(|error| error.to_string())?;
        let snapshot_cache_file = app_cache_dir
            .join("compendium")
            .join(&release.version)
            .join("snapshot")
            .join("card-metadata.json");
        let snapshot = ensure_snapshot(
            Path::new(&install.root_dir),
            &snapshot_cache_file,
            &release,
            force_refresh,
        )?;
        let stale = !snapshot_matches_release(&snapshot, &release);
        let resolved_locale = match locale.as_deref() {
            Some("en-US") => "en-US",
            _ => "zh-CN",
        };
        let locale_dir = if resolved_locale == "en-US" {
            "eng"
        } else {
            "zhs"
        };

        let archive = PckArchive::open(&Path::new(&install.root_dir).join("SlayTheSpire2.pck"))?;
        let cards_text: HashMap<String, String> = serde_json::from_slice(
            &archive.read_bytes(&format!("localization/{}/cards.json", locale_dir))?,
        )
        .map_err(|error| error.to_string())?;
        let keyword_text: HashMap<String, String> = serde_json::from_slice(
            &archive.read_bytes(&format!("localization/{}/card_keywords.json", locale_dir))?,
        )
        .map_err(|error| error.to_string())?;

        let keyword_catalog = build_keyword_catalog(&keyword_text);
        let cache_dir = app_cache_dir.join("compendium").join(&snapshot.version);
        fs::create_dir_all(&cache_dir).map_err(|error| error.to_string())?;
        let native_cache_dir = cache_dir.join("native");
        let native_fonts =
            materialize_native_fonts(&archive, &native_cache_dir, force_refresh).ok();
        let mut native_asset_extractor =
            NativeCardAssetExtractor::new(&archive, native_cache_dir, force_refresh).ok();

        let mut cards = Vec::with_capacity(snapshot.cards.len());
        for snapshot_card in &snapshot.cards {
            let name_key = format!("{}.title", snapshot_card.id);
            let description_key = format!("{}.description", snapshot_card.id);
            let art_file_path = materialize_art(
                &archive,
                &cache_dir,
                &snapshot_card.id,
                snapshot_card.art_ctex_path.as_deref(),
                force_refresh,
            )?;

            cards.push(CompendiumCard {
                id: snapshot_card.id.clone(),
                class_name: snapshot_card.class_name.clone(),
                name: cards_text
                    .get(&name_key)
                    .cloned()
                    .unwrap_or_else(|| snapshot_card.id.clone()),
                description_template: cards_text
                    .get(&description_key)
                    .cloned()
                    .unwrap_or_default(),
                character: snapshot_card.character.clone(),
                type_name: snapshot_card.type_name.clone(),
                rarity: snapshot_card.rarity.clone(),
                target: snapshot_card.target.clone(),
                energy: snapshot_card.energy,
                upgradable: snapshot_card.upgradable,
                vars: snapshot_card
                    .vars
                    .iter()
                    .map(|item| CompendiumVar {
                        kind: item.kind.clone(),
                        key: item.key.clone(),
                        value: item.value,
                    })
                    .collect(),
                keywords: snapshot_card.keywords.clone(),
                upgrade: CompendiumUpgrade {
                    energy_delta: snapshot_card.upgrade.energy_delta,
                    var_deltas: snapshot_card.upgrade.var_deltas.clone(),
                    added_keywords: snapshot_card.upgrade.added_keywords.clone(),
                    removed_keywords: snapshot_card.upgrade.removed_keywords.clone(),
                },
                art_file_path,
                native_assets: native_asset_extractor
                    .as_mut()
                    .and_then(|extractor| extractor.materialize_for_card(snapshot_card).ok())
                    .flatten(),
            });
        }

        Ok(CompendiumIndex {
            game_version: release.version,
            game_commit: release.commit,
            snapshot_version: snapshot.version.clone(),
            snapshot_commit: snapshot.commit.clone(),
            stale,
            locale: resolved_locale.to_string(),
            native_fonts,
            keyword_catalog,
            cards,
        })
    }
}

fn ensure_snapshot(
    game_root: &Path,
    snapshot_cache_file: &Path,
    release: &ReleaseInfo,
    force_refresh: bool,
) -> Result<CompendiumSnapshot, String> {
    if !force_refresh {
        if let Ok(snapshot) = load_snapshot_from_path(snapshot_cache_file) {
            if snapshot_matches_release(&snapshot, release) {
                return Ok(snapshot);
            }
        }
    }

    write_snapshot_for_game_root(game_root, snapshot_cache_file)?;
    load_snapshot_from_path(snapshot_cache_file)
}

fn load_snapshot_from_path(path: &Path) -> Result<CompendiumSnapshot, String> {
    serde_json::from_str(&fs::read_to_string(path).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())
}

fn snapshot_matches_release(snapshot: &CompendiumSnapshot, release: &ReleaseInfo) -> bool {
    snapshot.version == release.version && snapshot.commit == release.commit
}

fn build_keyword_catalog(
    keyword_text: &HashMap<String, String>,
) -> HashMap<String, CompendiumKeywordDefinition> {
    let mut catalog = HashMap::new();
    for (key, title) in keyword_text.iter().filter_map(|(key, value)| {
        key.strip_suffix(".title")
            .map(|base| (base.to_string(), value))
    }) {
        let description = keyword_text
            .get(&format!("{}.description", key))
            .cloned()
            .unwrap_or_default();
        catalog.insert(
            key.clone(),
            CompendiumKeywordDefinition {
                key,
                title: title.clone(),
                description,
            },
        );
    }
    catalog
}

fn materialize_native_fonts(
    archive: &PckArchive,
    native_cache_dir: &Path,
    force_refresh: bool,
) -> Result<CompendiumNativeFonts, String> {
    let font_cache_dir = native_cache_dir.join("fonts");
    fs::create_dir_all(&font_cache_dir).map_err(|error| error.to_string())?;

    let title_latin_file_path = materialize_font_file(
        archive,
        &font_cache_dir,
        "title_kreon_regular.ttf",
        TITLE_LATIN_FONT_RES_PATH,
        force_refresh,
    )?;
    let title_cjk_file_path = materialize_font_file(
        archive,
        &font_cache_dir,
        "title_source_han_serif_sc_medium.otf",
        TITLE_CJK_FONT_RES_PATH,
        force_refresh,
    )?;

    Ok(CompendiumNativeFonts {
        title_latin_file_path,
        title_cjk_file_path,
    })
}

fn materialize_font_file(
    archive: &PckArchive,
    cache_dir: &Path,
    output_name: &str,
    res_path: &str,
    force_refresh: bool,
) -> Result<String, String> {
    let output_path = cache_dir.join(output_name);
    if !force_refresh && output_path.exists() {
        return Ok(output_path.to_string_lossy().to_string());
    }

    let import_path = format!("{}.import", res_path.trim_start_matches("res://"));
    let import_text = archive.read_text(&import_path)?;
    let fontdata_path = extract_imported_resource_path(&import_text)
        .ok_or_else(|| format!("imported font path not found in {import_path}"))?;
    let fontdata_bytes = archive.read_bytes(&fontdata_path)?;
    let font_bytes = extract_font_bytes_from_fontdata(&fontdata_bytes)?;

    fs::write(&output_path, font_bytes).map_err(|error| error.to_string())?;
    Ok(output_path.to_string_lossy().to_string())
}

fn materialize_art(
    archive: &PckArchive,
    cache_dir: &Path,
    card_id: &str,
    ctex_path: Option<&str>,
    force_refresh: bool,
) -> Result<Option<String>, String> {
    let Some(ctex_path) = ctex_path else {
        return Ok(None);
    };

    let output_path = cache_dir.join(format!("{}.webp", card_id.to_lowercase()));
    if force_refresh || !output_path.exists() {
        let ctex_bytes = archive.read_bytes(ctex_path)?;
        let webp_bytes = extract_webp(&ctex_bytes)
            .ok_or_else(|| format!("embedded WEBP not found in {}", ctex_path))?;
        fs::write(&output_path, webp_bytes).map_err(|error| error.to_string())?;
    }

    Ok(Some(output_path.to_string_lossy().to_string()))
}

fn extract_webp(bytes: &[u8]) -> Option<&[u8]> {
    let mut index = 0;
    while index + 12 <= bytes.len() {
        if &bytes[index..index + 4] == b"RIFF" && &bytes[index + 8..index + 12] == b"WEBP" {
            let riff_size =
                u32::from_le_bytes(bytes[index + 4..index + 8].try_into().ok()?) as usize;
            let end = index + 8 + riff_size;
            if end <= bytes.len() {
                return Some(&bytes[index..end]);
            }
        }
        index += 1;
    }
    None
}

fn extract_resource_path(text: &str) -> Option<String> {
    extract_quoted_value(text, "path=\"res://").map(|value| format!("res://{value}"))
}

fn extract_imported_resource_path(text: &str) -> Option<String> {
    [
        "path.bptc=\"res://",
        "path.s3tc=\"res://",
        "path.astc=\"res://",
        "path.etc2=\"res://",
        "path=\"res://",
    ]
    .into_iter()
    .find_map(|marker| extract_quoted_value(text, marker).map(|value| value.to_string()))
}

fn extract_font_bytes_from_fontdata(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let resource_bytes = decompress_rscc_resource(bytes)?;
    let (start, end) = find_sfnt_font_region(&resource_bytes)
        .ok_or_else(|| "raw font bytes not found in fontdata resource".to_string())?;
    Ok(resource_bytes[start..end].to_vec())
}

fn decompress_rscc_resource(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() < 16 || &bytes[0..4] != b"RSCC" {
        return Err("unexpected compressed resource header".to_string());
    }

    let block_size = u32::from_le_bytes(
        bytes[8..12]
            .try_into()
            .map_err(|_| "invalid RSCC block size")?,
    ) as usize;
    let decompressed_size = u32::from_le_bytes(
        bytes[12..16]
            .try_into()
            .map_err(|_| "invalid RSCC payload size")?,
    ) as usize;
    let block_count = decompressed_size.div_ceil(block_size);
    let size_table_end = 16 + (block_count * 4);
    if bytes.len() < size_table_end {
        return Err("truncated RSCC size table".to_string());
    }

    let mut cursor = 16;
    let mut compressed_sizes = Vec::with_capacity(block_count);
    for _ in 0..block_count {
        compressed_sizes.push(u32::from_le_bytes(
            bytes[cursor..cursor + 4]
                .try_into()
                .map_err(|_| "invalid RSCC chunk size")?,
        ) as usize);
        cursor += 4;
    }

    let mut output = Vec::with_capacity(decompressed_size);
    for compressed_size in compressed_sizes {
        let chunk_end = cursor + compressed_size;
        if chunk_end > bytes.len() {
            return Err("truncated RSCC compressed chunk".to_string());
        }

        let chunk = &bytes[cursor..chunk_end];
        let decompressed = zstd::stream::decode_all(chunk).map_err(|error| error.to_string())?;
        output.extend_from_slice(&decompressed);
        cursor = chunk_end;
    }

    if output.len() != decompressed_size {
        return Err(format!(
            "unexpected RSCC payload size: expected {}, got {}",
            decompressed_size,
            output.len()
        ));
    }

    Ok(output)
}

fn find_sfnt_font_region(bytes: &[u8]) -> Option<(usize, usize)> {
    let mut candidate = None;
    for start in 0..bytes.len().saturating_sub(12) {
        if !matches!(&bytes[start..start + 4], b"OTTO" | [0, 1, 0, 0]) {
            continue;
        }

        if let Some(end) = parse_sfnt_font_end(bytes, start) {
            candidate = Some((start, end));
        }
    }
    candidate
}

fn parse_sfnt_font_end(bytes: &[u8], start: usize) -> Option<usize> {
    if start + 12 > bytes.len() {
        return None;
    }

    let table_count = u16::from_be_bytes(bytes[start + 4..start + 6].try_into().ok()?) as usize;
    if !(4..=80).contains(&table_count) {
        return None;
    }

    let table_dir_end = start.checked_add(12 + (table_count * 16))?;
    if table_dir_end > bytes.len() {
        return None;
    }

    let mut max_end = table_dir_end;
    let mut has_cmap = false;
    let mut has_head = false;
    let mut has_hhea = false;
    let mut has_hmtx = false;
    let mut has_maxp = false;
    let mut has_name = false;
    let mut has_outline = false;

    for index in 0..table_count {
        let entry_offset = start + 12 + (index * 16);
        let tag = &bytes[entry_offset..entry_offset + 4];
        if !tag
            .iter()
            .all(|byte| byte.is_ascii_graphic() || *byte == b' ')
        {
            return None;
        }

        let table_offset =
            u32::from_be_bytes(bytes[entry_offset + 8..entry_offset + 12].try_into().ok()?)
                as usize;
        let table_length = u32::from_be_bytes(
            bytes[entry_offset + 12..entry_offset + 16]
                .try_into()
                .ok()?,
        ) as usize;
        let table_end = start.checked_add(table_offset)?.checked_add(table_length)?;
        if table_end > bytes.len() {
            return None;
        }
        max_end = max_end.max(table_end);

        match tag {
            b"cmap" => has_cmap = true,
            b"head" => has_head = true,
            b"hhea" => has_hhea = true,
            b"hmtx" => has_hmtx = true,
            b"maxp" => has_maxp = true,
            b"name" => has_name = true,
            b"glyf" | b"CFF " => has_outline = true,
            _ => {}
        }
    }

    if has_cmap && has_head && has_hhea && has_hmtx && has_maxp && has_name && has_outline {
        Some(max_end)
    } else {
        None
    }
}

fn extract_quoted_value<'a>(text: &'a str, marker: &str) -> Option<&'a str> {
    let start = text.find(marker)? + marker.len();
    let rest = &text[start..];
    let end = rest.find('"')?;
    Some(&rest[..end])
}

fn extract_rect2(text: &str, marker: &str) -> Option<TextureRegion> {
    let start = text.find(marker)? + marker.len();
    let rest = &text[start..];
    let end = rest.find(')')?;
    let values = rest[..end]
        .split(',')
        .map(|value| value.trim().parse::<f32>().ok().map(|n| n.round() as u32))
        .collect::<Option<Vec<_>>>()?;
    if values.len() != 4 {
        return None;
    }

    Some(TextureRegion {
        x: values[0],
        y: values[1],
        width: values[2],
        height: values[3],
    })
}

fn extract_float_assignment(text: &str, marker: &str) -> Option<f32> {
    let start = text.find(marker)? + marker.len();
    let value = text[start..].lines().next()?.trim().trim_end_matches('\r');
    value.parse::<f32>().ok()
}

fn decode_ctex_image(bytes: &[u8]) -> Result<RgbaImage, String> {
    if bytes.len() < 52 || &bytes[0..4] != b"GST2" {
        return Err("unexpected CTEX header".to_string());
    }

    let width = u32::from_le_bytes(bytes[8..12].try_into().map_err(|_| "invalid CTEX width")?);
    let height = u32::from_le_bytes(
        bytes[12..16]
            .try_into()
            .map_err(|_| "invalid CTEX height")?,
    );
    let format = u32::from_le_bytes(
        bytes[48..52]
            .try_into()
            .map_err(|_| "invalid CTEX format")?,
    );

    match format {
        22 => decode_bc7_ctex(bytes, width, height),
        _ => decode_embedded_webp_ctex(bytes),
    }
}

fn decode_bc7_ctex(bytes: &[u8], width: u32, height: u32) -> Result<RgbaImage, String> {
    let pixel_count = (width as usize)
        .checked_mul(height as usize)
        .ok_or_else(|| "BC7 texture dimensions overflow".to_string())?;
    let mut decoded = vec![0_u32; pixel_count];
    decode_bc7(&bytes[52..], width as usize, height as usize, &mut decoded)
        .map_err(|error| error.to_string())?;

    let mut rgba = Vec::with_capacity(pixel_count * 4);
    for pixel in decoded {
        let [b, g, r, a] = pixel.to_le_bytes();
        rgba.extend_from_slice(&[r, g, b, a]);
    }

    ImageBuffer::from_raw(width, height, rgba)
        .ok_or_else(|| "failed to create RGBA image buffer".to_string())
}

fn decode_embedded_webp_ctex(bytes: &[u8]) -> Result<RgbaImage, String> {
    let webp_bytes =
        extract_webp(bytes).ok_or_else(|| "embedded WEBP payload not found".to_string())?;
    let image = image::load_from_memory_with_format(webp_bytes, ImageFormat::WebP)
        .map_err(|error| error.to_string())?;
    Ok(image.to_rgba8())
}

fn apply_hsv_in_place(image: &mut RgbaImage, params: HsvMaterialParams) {
    let hue = (1.0 - params.h) * std::f32::consts::TAU;
    let sin_hue = hue.sin();
    let cos_hue = hue.cos();

    for pixel in image.pixels_mut() {
        let [r, g, b, a] = pixel.0;
        if a == 0 {
            continue;
        }

        let rf = r as f32 / 255.0;
        let gf = g as f32 / 255.0;
        let bf = b as f32 / 255.0;

        let y = 0.2989 * rf + 0.5870 * gf + 0.1140 * bf;
        let i = 0.5959 * rf - 0.2774 * gf - 0.3216 * bf;
        let q = 0.2115 * rf - 0.5229 * gf + 0.3114 * bf;

        let rotated_i = i * cos_hue - q * sin_hue;
        let rotated_q = i * sin_hue + q * cos_hue;

        let yiq_y = y * params.v;
        let yiq_i = rotated_i * params.s * params.v;
        let yiq_q = rotated_q * params.s * params.v;

        let out_r = (yiq_y + 0.9563 * yiq_i + 0.6210 * yiq_q).clamp(0.0, 1.0);
        let out_g = (yiq_y - 0.2721 * yiq_i - 0.6474 * yiq_q).clamp(0.0, 1.0);
        let out_b = (yiq_y - 1.1070 * yiq_i + 1.7046 * yiq_q).clamp(0.0, 1.0);

        *pixel = Rgba([
            (out_r * 255.0).round() as u8,
            (out_g * 255.0).round() as u8,
            (out_b * 255.0).round() as u8,
            a,
        ]);
    }
}

fn save_png(path: &Path, image: &RgbaImage) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    DynamicImage::ImageRgba8(image.clone())
        .save_with_format(path, ImageFormat::Png)
        .map_err(|error| error.to_string())
}

fn read_u32(file: &mut File) -> Result<u32, String> {
    let mut buffer = [0_u8; 4];
    file.read_exact(&mut buffer)
        .map_err(|error| error.to_string())?;
    Ok(u32::from_le_bytes(buffer))
}

fn read_u64(file: &mut File) -> Result<u64, String> {
    let mut buffer = [0_u8; 8];
    file.read_exact(&mut buffer)
        .map_err(|error| error.to_string())?;
    Ok(u64::from_le_bytes(buffer))
}
