use std::collections::HashSet;

use chrono::Utc;
use uuid::Uuid;

use crate::app::state::AppSettings;
use crate::domain::profile::{ApplyProfileResult, ModProfile};
use crate::repositories::profiles_repo::ProfilesRepo;
use crate::services::mod_service::ModService;

pub struct ProfileService;

impl ProfileService {
    pub fn list(&self) -> Result<Vec<ModProfile>, String> {
        let mut profiles = ProfilesRepo::load_profiles()?;
        profiles.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
        Ok(profiles)
    }

    pub fn create(
        &self,
        name: String,
        description: Option<String>,
        mod_ids: Vec<String>,
    ) -> Result<ModProfile, String> {
        let mut profiles = ProfilesRepo::load_profiles()?;
        validate_name(&profiles, &name, None)?;

        let now = Utc::now().to_rfc3339();
        let profile = ModProfile {
            id: Uuid::new_v4().to_string(),
            name: name.trim().to_string(),
            description: normalize_description(description),
            mod_ids: normalize_mod_ids(mod_ids),
            created_at: now.clone(),
            updated_at: now,
        };

        profiles.push(profile.clone());
        ProfilesRepo::save_profiles(&profiles)?;
        Ok(profile)
    }

    pub fn update(&self, profile: ModProfile) -> Result<ModProfile, String> {
        let mut profiles = ProfilesRepo::load_profiles()?;
        validate_name(&profiles, &profile.name, Some(profile.id.as_str()))?;

        let index = profiles
            .iter()
            .position(|item| item.id == profile.id)
            .ok_or_else(|| "profile not found".to_string())?;

        let updated = ModProfile {
            id: profile.id,
            name: profile.name.trim().to_string(),
            description: normalize_description(profile.description),
            mod_ids: normalize_mod_ids(profile.mod_ids),
            created_at: profiles[index].created_at.clone(),
            updated_at: Utc::now().to_rfc3339(),
        };

        profiles[index] = updated.clone();
        ProfilesRepo::save_profiles(&profiles)?;
        Ok(updated)
    }

    pub fn delete(&self, profile_id: &str) -> Result<ModProfile, String> {
        let mut profiles = ProfilesRepo::load_profiles()?;
        let index = profiles
            .iter()
            .position(|item| item.id == profile_id)
            .ok_or_else(|| "profile not found".to_string())?;

        let removed = profiles.remove(index);
        ProfilesRepo::save_profiles(&profiles)?;
        Ok(removed)
    }

    pub fn get(&self, profile_id: &str) -> Result<ModProfile, String> {
        self.list()?
            .into_iter()
            .find(|item| item.id == profile_id)
            .ok_or_else(|| "profile not found".to_string())
    }

    pub fn apply(
        &self,
        profile_id: &str,
        settings: AppSettings,
    ) -> Result<ApplyProfileResult, String> {
        let profile = self.get(profile_id)?;
        let service = ModService::new(settings);
        let enabled = service.list_installed().map_err(|error| error.to_string())?;
        let disabled = service.list_disabled().map_err(|error| error.to_string())?;

        let desired = normalize_mod_ids(profile.mod_ids.clone());
        let desired_lookup = desired
            .iter()
            .map(|item| item.to_lowercase())
            .collect::<HashSet<_>>();

        let all_known = enabled
            .iter()
            .chain(disabled.iter())
            .map(|item| item.id.to_lowercase())
            .collect::<HashSet<_>>();

        let mut enabled_mod_ids = Vec::new();
        let mut disabled_mod_ids = Vec::new();

        for mod_item in &disabled {
            if desired_lookup.contains(&mod_item.id.to_lowercase()) {
                service
                    .enable(&mod_item.id)
                    .map_err(|error| error.to_string())?;
                enabled_mod_ids.push(mod_item.id.clone());
            }
        }

        for mod_item in &enabled {
            if !desired_lookup.contains(&mod_item.id.to_lowercase()) {
                service
                    .disable(&mod_item.id)
                    .map_err(|error| error.to_string())?;
                disabled_mod_ids.push(mod_item.id.clone());
            }
        }

        let missing_mod_ids = desired
            .into_iter()
            .filter(|item| !all_known.contains(&item.to_lowercase()))
            .collect::<Vec<_>>();

        Ok(ApplyProfileResult {
            profile,
            enabled_mod_ids,
            disabled_mod_ids,
            missing_mod_ids,
        })
    }
}

fn validate_name(profiles: &[ModProfile], name: &str, current_id: Option<&str>) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("profile name is required".to_string());
    }

    let duplicate = profiles.iter().any(|item| {
        item.name.eq_ignore_ascii_case(trimmed)
            && current_id.map(|id| id != item.id).unwrap_or(true)
    });

    if duplicate {
        return Err("profile name already exists".to_string());
    }

    Ok(())
}

fn normalize_description(description: Option<String>) -> Option<String> {
    description.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    })
}

fn normalize_mod_ids(mod_ids: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for item in mod_ids {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            continue;
        }

        let key = trimmed.to_lowercase();
        if seen.insert(key) {
            normalized.push(trimmed.to_string());
        }
    }

    normalized
}
