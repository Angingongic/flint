use super::*;
// Container validation is not a codec guarantee: playback errors are handled by the UI.
pub fn valid_video(extension: &str, bytes: &[u8]) -> bool {
    if bytes.len() > 25 * 1024 * 1024 {
        return false;
    }
    match extension.to_ascii_lowercase().as_str() {
        "mp4" => bytes.len() >= 12 && &bytes[4..8] == b"ftyp",
        "webm" => bytes.starts_with(&[0x1a, 0x45, 0xdf, 0xa3]),
        _ => false,
    }
}
pub fn valid_gif(bytes: &[u8]) -> bool {
    if bytes.len() < 14
        || bytes.len() > 25 * 1024 * 1024
        || !(bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"))
    {
        return false;
    }
    let w = u16::from_le_bytes([bytes[6], bytes[7]]);
    let h = u16::from_le_bytes([bytes[8], bytes[9]]);
    w > 0 && h > 0 && w <= 8192 && h <= 8192 && bytes.last() == Some(&0x3b)
}
#[tauri::command]
pub fn save_video_bytes(data: Vec<u8>, extension: String, db: State<Db>) -> Result<String, String> {
    if !valid_video(&extension, &data) {
        return Err(
            "Choose MP4 or WebM video up to 25 MB. Codec support depends on your device.".into(),
        );
    }
    let name = format!("{}.{}", Uuid::new_v4(), extension.to_ascii_lowercase());
    fs::create_dir_all(&db.media_dir).map_err(|e| e.to_string())?;
    fs::write(db.media_dir.join(&name), data).map_err(|e| e.to_string())?;
    Ok(name)
}
pub fn storage_bytes(db_path: &Path, media: &Path) -> Result<u64, String> {
    let mut total = 0;
    for path in [
        db_path.to_path_buf(),
        PathBuf::from(format!("{}-wal", db_path.display())),
    ] {
        match fs::metadata(path) {
            Ok(m) => total += m.len(),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    if media.exists() {
        for entry in fs::read_dir(media).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let kind = entry.file_type().map_err(|e| e.to_string())?;
            if kind.is_file() {
                total += entry.metadata().map_err(|e| e.to_string())?.len();
            }
        }
    }
    Ok(total)
}
#[tauri::command]
pub fn library_storage_bytes(db: State<Db>) -> Result<u64, String> {
    storage_bytes(&db.path, &db.media_dir)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn storage_counts_database_wal_and_media_without_backups() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("db.sqlite3");
        let media = dir.path().join("media");
        fs::create_dir(&media).unwrap();
        fs::write(&db, [0u8; 100]).unwrap();
        fs::write(dir.path().join("db.sqlite3-wal"), [0u8; 20]).unwrap();
        fs::write(media.join("v.mp4"), [0u8; 400]).unwrap();
        fs::write(dir.path().join("backup.flintbackup"), [0u8; 1000]).unwrap();
        assert_eq!(storage_bytes(&db, &media).unwrap(), 520);
        fs::remove_file(media.join("v.mp4")).unwrap();
        assert_eq!(storage_bytes(&db, &media).unwrap(), 120);
    }
    #[test]
    fn media_containers_reject_bad_headers_and_unsupported_extensions() {
        assert!(!valid_video("mov", b"0000ftypisom"));
        assert!(!valid_video("mp4", b"bad"));
        assert!(!valid_gif(b"GIF89a"));
        assert!(valid_video("webm", &[0x1a, 0x45, 0xdf, 0xa3]));
    }
}
