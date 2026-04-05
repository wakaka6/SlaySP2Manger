use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("game install not found")]
    GameNotFound,
    #[error("mod `{0}` not found")]
    ModNotFound(String),
    #[error("mod conflict detected: {0}")]
    ModConflict(String),
    #[error("invalid archive: {0}")]
    InvalidArchive(String),
    #[error("unsupported format ({0}): {1}")]
    UnsupportedFormat(String, String),
    #[error("io error: {0}")]
    Io(String),
}
