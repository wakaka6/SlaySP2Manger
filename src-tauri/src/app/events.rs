use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskEventDto {
    pub task_id: String,
    pub stage: String,
    pub message: String,
    pub progress: f32,
}
