use std::path::{Path, PathBuf};

pub fn join(base: &Path, segment: &str) -> PathBuf {
    base.join(segment)
}
