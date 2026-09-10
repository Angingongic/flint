use super::*;
pub fn valid_audio(extension: &str, data: &[u8]) -> bool {
    if data.is_empty() || data.len() > 25 * 1024 * 1024 {
        return false;
    }
    match extension.to_ascii_lowercase().as_str() {
        "mp3" => {
            data.starts_with(b"ID3")
                || data.len() > 2 && data[0] == 0xff && (data[1] & 0xe0) == 0xe0
        }
        "wav" => data.len() >= 12 && &data[..4] == b"RIFF" && &data[8..12] == b"WAVE",
        "m4a" => data.len() >= 12 && &data[4..8] == b"ftyp",
        "ogg" => data.starts_with(b"OggS"),
        _ => false,
    }
}
#[tauri::command]
pub fn save_audio_bytes(data: Vec<u8>, extension: String, db: State<Db>) -> Result<String, String> {
    if !valid_audio(&extension, &data) {
        return Err("Choose valid MP3, M4A, WAV or OGG audio up to 25 MB".into());
    }
    let name = format!("{}.{}", Uuid::new_v4(), extension.to_ascii_lowercase());
    fs::create_dir_all(&db.media_dir).map_err(|e| e.to_string())?;
    fs::write(db.media_dir.join(&name), data).map_err(|e| e.to_string())?;
    Ok(name)
}
