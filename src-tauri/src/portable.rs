//! Version-one portable sets: ZIP + JSON + raster media, never extracted paths or code.
use super::*;
use std::collections::HashMap;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};
const MAX_SET: u64 = 100 * 1024 * 1024;
const MAX_ENTRY: u64 = 25 * 1024 * 1024;
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    format: String,
    version: u32,
    deck: Deck,
}
struct Package {
    manifest: Manifest,
    media: HashMap<String, Vec<u8>>,
}
pub struct PendingSet(Mutex<Option<(String, Package)>>);
impl Default for PendingSet {
    fn default() -> Self {
        Self(Mutex::new(None))
    }
}
#[derive(Serialize)]
pub struct Preview {
    token: String,
    deck: Deck,
    media: HashMap<String, Vec<u8>>,
}
fn safe_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() < 180
        && !name.contains("..")
        && name
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
}
fn valid_image(name: &str, bytes: &[u8]) -> bool {
    let ext = Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let format = match ext.as_str() {
        "png" => image::ImageFormat::Png,
        "jpg" | "jpeg" => image::ImageFormat::Jpeg,
        "webp" => image::ImageFormat::WebP,
        _ => return false,
    };
    let mut reader = image::ImageReader::with_format(std::io::Cursor::new(bytes), format);
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(256 * 1024 * 1024);
    reader.limits(limits);
    reader.decode().is_ok()
}
fn refs(deck: &Deck) -> Vec<&str> {
    deck.cover_image
        .iter()
        .filter(|s| !s.starts_with("flint:preset/"))
        .chain(deck.cards.iter().flat_map(|c| {
            c.question_image
                .iter()
                .chain(c.answer_image.iter())
                .chain(c.question_audio.iter())
                .chain(c.answer_audio.iter())
        }))
        .map(String::as_str)
        .collect()
}
fn validate(package: &Package) -> Result<(), String> {
    let manifest = &package.manifest;
    let deck = &manifest.deck;
    if manifest.format != "flint-set" || !matches!(manifest.version, 1 | 2) {
        return Err(
            "Unsupported Flint set format/version. Update Flint to open newer formats.".into(),
        );
    }
    if deck.id.is_empty()
        || deck.id.len() > 180
        || deck.title.trim().is_empty()
        || deck.title.len() > 1000
        || deck.subject.len() > 1000
        || deck.cards.is_empty()
        || deck.cards.len() > 10000
    {
        return Err("Invalid set title or card count (1–10,000 required)".into());
    }
    if !matches!(deck.color.len(), 4 | 7 | 9)
        || !deck.color.starts_with('#')
        || !deck.color[1..].bytes().all(|b| b.is_ascii_hexdigit())
        || (!deck.meta.is_null() && !deck.meta.is_object())
        || deck.meta.to_string().len() > 1024 * 1024
    {
        return Err("Invalid set metadata".into());
    }
    if deck
        .created_at
        .iter()
        .chain(deck.last_studied.iter())
        .any(|s| DateTime::parse_from_rfc3339(s).is_err())
    {
        return Err("Invalid set timestamp".into());
    }
    if let Some(cover) = &deck.cover_image {
        if cover.starts_with("flint:")
            && ![
                "ember",
                "tidal",
                "iris",
                "fern",
                "atlas",
                "lunar",
                "spectrum",
                "lagoon",
                "terracotta",
                "orbit",
                "blueprint",
                "petal",
                "solstice",
                "alpine",
                "cobalt",
                "saffron",
                "aurora",
                "ripple",
                "meadow",
                "graphite",
                "prism",
                "cloud",
                "contour",
                "parchment",
            ]
            .iter()
            .any(|name| cover == &format!("flint:preset/{name}"))
        {
            return Err("Unknown cover preset".into());
        }
    }
    for key in ["description", "folder"] {
        if deck.meta.get(key).is_some_and(|v| !v.is_string()) {
            return Err(format!("Invalid {key}"));
        }
    }
    for key in ["tags", "starredCards"] {
        if deck.meta.get(key).is_some_and(|v| {
            !v.as_array().is_some_and(|a| {
                a.len() <= 10000 && a.iter().all(|v| v.as_str().is_some_and(|s| s.len() < 1000))
            })
        }) {
            return Err(format!("Invalid {key}"));
        }
    }
    let mut ids = HashSet::new();
    for c in &deck.cards {
        if c.id.is_empty()
            || c.id.len() > 180
            || !ids.insert(c.id.as_str())
            || c.question.len() > 100000
            || c.answer.len() > 100000
            || (c.question.trim().is_empty()
                && c.question_image.is_none()
                && c.question_audio.is_none())
            || (c.answer.trim().is_empty() && c.answer_image.is_none() && c.answer_audio.is_none())
        {
            return Err("Invalid card content or duplicate card ID".into());
        }
        if !["New", "Learning", "Review", "Mastered"].contains(&c.status.as_str())
            || !(0.0..=100.0).contains(&c.accuracy)
            || !(0.0..=1e7).contains(&c.interval_days)
            || !(0.0..=100.0).contains(&c.ease)
            || c.repetitions < 0
            || c.lapses < 0
            || DateTime::parse_from_rfc3339(&c.due_at).is_err()
        {
            return Err("Invalid card study metadata".into());
        }
    }
    if deck
        .meta
        .get("starredCards")
        .and_then(|v| v.as_array())
        .is_some_and(|a| a.iter().any(|v| !ids.contains(v.as_str().unwrap_or(""))))
    {
        return Err("Starred card references a missing card".into());
    }
    let references: HashSet<_> = refs(deck).into_iter().collect();
    for c in &deck.cards {
        for name in c.question_audio.iter().chain(c.answer_audio.iter()) {
            if manifest.version < 2
                || !package.media.get(name).is_some_and(|bytes| {
                    audio::valid_audio(
                        Path::new(name)
                            .extension()
                            .and_then(|s| s.to_str())
                            .unwrap_or(""),
                        bytes,
                    )
                })
            {
                return Err("Invalid audio attachment or old package format".into());
            }
        }
        for name in c.question_image.iter().chain(c.answer_image.iter()) {
            if !package
                .media
                .get(name)
                .is_some_and(|bytes| valid_image(name, bytes))
            {
                return Err("Invalid image attachment".into());
            }
        }
    }
    let mut total = 0u64;
    for (name, bytes) in &package.media {
        total += bytes.len() as u64;
        if !safe_name(name)
            || bytes.len() as u64 > MAX_ENTRY
            || !(valid_image(name, bytes)
                || audio::valid_audio(
                    Path::new(name)
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or(""),
                    bytes,
                ))
            || !references.contains(name.as_str())
        {
            return Err("Unsafe, unsupported, or unreferenced media".into());
        }
    }
    if total > MAX_SET
        || references
            .iter()
            .any(|name| !package.media.contains_key(*name))
    {
        return Err("Missing media or set exceeds 100 MB".into());
    }
    Ok(())
}
fn read_package(path: &Path) -> Result<Package, String> {
    if !path
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case("flint"))
    {
        return Err("Choose a .flint study set, not a .flintbackup library backup".into());
    }
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > MAX_SET {
        return Err("Set exceeds 100 MB".into());
    }
    let mut zip = ZipArchive::new(file).map_err(|_| "Corrupt Flint set archive")?;
    if zip.len() > 20002 {
        return Err("Too many archive entries".into());
    }
    let mut seen = HashSet::new();
    let mut total = 0;
    let mut manifest = None;
    let mut media = HashMap::new();
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        total += entry.size();
        if total > MAX_SET || entry.size() > MAX_ENTRY || !seen.insert(name.clone()) {
            return Err("Oversized or duplicate archive entry".into());
        }
        if name != "manifest.json" && !name.strip_prefix("media/").is_some_and(safe_name) {
            return Err("Unexpected or unsafe archive path".into());
        }
        let mut bytes = Vec::new();
        entry
            .by_ref()
            .take(MAX_ENTRY + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "Corrupt archive content")?;
        if bytes.len() as u64 > MAX_ENTRY {
            return Err("Archive entry exceeds 25 MB".into());
        }
        if name == "manifest.json" {
            manifest = Some(bytes);
        } else {
            media.insert(name[6..].to_string(), bytes);
        }
    }
    let manifest = serde_json::from_slice(&manifest.ok_or("Missing manifest")?)
        .map_err(|e| format!("Invalid manifest: {e}"))?;
    let package = Package { manifest, media };
    validate(&package)?;
    Ok(package)
}
fn write_package(path: &Path, package: &Package) -> Result<(), String> {
    validate(package)?;
    let manifest = serde_json::to_vec(&package.manifest).map_err(|e| e.to_string())?;
    if manifest.len() as u64 > MAX_ENTRY
        || manifest.len() as u64 + package.media.values().map(|v| v.len() as u64).sum::<u64>()
            > MAX_SET
    {
        return Err("Set exceeds 100 MB".into());
    }
    // Assemble before opening the destination; failures never leave a partial archive.
    let mut zip = ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    zip.start_file("manifest.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(&manifest).map_err(|e| e.to_string())?;
    for (name, bytes) in &package.media {
        zip.start_file(format!("media/{name}"), options)
            .map_err(|e| e.to_string())?;
        zip.write_all(bytes).map_err(|e| e.to_string())?;
    }
    let bytes = zip.finish().map_err(|e| e.to_string())?.into_inner();
    if bytes.len() as u64 > MAX_SET {
        return Err("Compressed set exceeds 100 MB".into());
    }
    let temporary = path.with_file_name(format!(".flint-export-{}.tmp", Uuid::new_v4()));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
#[tauri::command]
pub fn export_flint(path: String, deck: Deck, db: State<Db>) -> Result<(), String> {
    let mut media = HashMap::new();
    let mut total = 0;
    for name in refs(&deck) {
        if media.contains_key(name) {
            continue;
        }
        if !safe_name(name) {
            return Err("Invalid media reference".into());
        }
        let path = db.media_dir.join(name);
        let size = fs::metadata(&path).map_err(|e| e.to_string())?.len();
        total += size;
        if size > MAX_ENTRY || total > MAX_SET {
            return Err("Set/media exceeds export limit".into());
        }
        media.insert(name.to_string(), fs::read(path).map_err(|e| e.to_string())?);
    }
    write_package(
        Path::new(&path),
        &Package {
            manifest: Manifest {
                format: "flint-set".into(),
                version: if deck
                    .cards
                    .iter()
                    .any(|c| c.question_audio.is_some() || c.answer_audio.is_some())
                {
                    2
                } else {
                    1
                },
                deck,
            },
            media,
        },
    )
}
#[tauri::command]
pub fn preview_flint(path: String, pending: State<PendingSet>) -> Result<Preview, String> {
    let package = read_package(Path::new(&path))?;
    let deck = package.manifest.deck.clone();
    let token = Uuid::new_v4().to_string();
    let preview_names: HashSet<_> = deck
        .cover_image
        .iter()
        .chain(deck.cards.iter().take(5).flat_map(|c| {
            c.question_image
                .iter()
                .chain(c.answer_image.iter())
                .chain(c.question_audio.iter())
                .chain(c.answer_audio.iter())
        }))
        .collect();
    let media = package
        .media
        .iter()
        .filter(|(name, _)| preview_names.contains(name))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    *pending.0.lock().map_err(|e| e.to_string())? = Some((token.clone(), package));
    Ok(Preview { token, deck, media })
}
#[tauri::command]
pub fn cancel_flint(token: String, pending: State<PendingSet>) -> Result<(), String> {
    let mut pending = pending.0.lock().map_err(|e| e.to_string())?;
    if pending.as_ref().is_some_and(|(id, _)| id == &token) {
        *pending = None;
    }
    Ok(())
}
fn import_package(package: &Package, db: &Db) -> Result<Deck, String> {
    validate(package)?;
    let mut deck = package.manifest.deck.clone();
    deck.id = Uuid::new_v4().to_string();
    let ids: HashMap<_, _> = deck
        .cards
        .iter_mut()
        .map(|c| {
            let old = c.id.clone();
            c.id = Uuid::new_v4().to_string();
            (old, c.id.clone())
        })
        .collect();
    if let Some(meta) = deck.meta.as_object_mut() {
        meta.remove("deletedAt");
        meta.insert("archived".into(), false.into());
        if let Some(stars) = meta.get_mut("starredCards").and_then(|v| v.as_array_mut()) {
            *stars = stars
                .iter()
                .filter_map(|v| {
                    ids.get(v.as_str()?)
                        .map(|s| serde_json::Value::String(s.clone()))
                })
                .collect();
        }
    }
    let mut created = Vec::new();
    let mut mapped = HashMap::new();
    let result = (|| -> Result<(), String> {
        for (name, bytes) in &package.media {
            let extension = Path::new(name)
                .extension()
                .and_then(|s| s.to_str())
                .ok_or("Missing media extension")?;
            let new = format!("{}.{}", Uuid::new_v4(), extension);
            let path = db.media_dir.join(&new);
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
                .map_err(|e| e.to_string())?;
            created.push(path);
            file.write_all(bytes).map_err(|e| e.to_string())?;
            mapped.insert(name.clone(), new);
        }
        for name in deck
            .cover_image
            .iter_mut()
            .chain(deck.cards.iter_mut().flat_map(|c| {
                c.question_image
                    .iter_mut()
                    .chain(c.answer_image.iter_mut())
                    .chain(c.question_audio.iter_mut())
                    .chain(c.answer_audio.iter_mut())
            }))
        {
            if let Some(new) = mapped.get(name) {
                *name = new.clone();
            }
        }
        let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
        for id in std::iter::once(&deck.id).chain(deck.cards.iter().map(|c| &c.id)) {
            let exists:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM decks WHERE id=?1 UNION ALL SELECT 1 FROM cards WHERE id=?1)",[id],|r|r.get(0)).map_err(|e|e.to_string())?;
            if exists {
                return Err("ID collision; import again to generate new IDs".into());
            }
        }
        persist_deck(&mut conn, &deck, Some("flint-set"))
    })();
    if let Err(error) = result {
        for path in created {
            let _ = fs::remove_file(path);
        }
        return Err(error);
    }
    Ok(deck)
}
#[tauri::command]
pub fn import_flint(
    token: String,
    choices: Option<Vec<DuplicateChoice>>,
    pending: State<PendingSet>,
    db: State<Db>,
) -> Result<Deck, String> {
    let mut pending = pending.0.lock().map_err(|e| e.to_string())?;
    let (id, package) = pending
        .as_ref()
        .ok_or("Preview this set before importing")?;
    if id != &token {
        return Err("Preview expired; reopen the set".into());
    }
    let resolved = resolve_choices(package, choices.unwrap_or_default())?;
    let deck = import_package(&resolved, &db)?;
    *pending = None;
    Ok(deck)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DuplicateChoice {
    card_id: String,
    target_id: String,
    action: String,
}
fn resolve_choices(package: &Package, choices: Vec<DuplicateChoice>) -> Result<Package, String> {
    let mut deck = package.manifest.deck.clone();
    let mut seen = HashSet::new();
    for choice in choices {
        if !seen.insert(choice.card_id.clone()) {
            return Err("Repeated duplicate decision".into());
        }
        let from = deck
            .cards
            .iter()
            .position(|c| c.id == choice.card_id)
            .ok_or("Unknown duplicate card")?;
        let to = deck
            .cards
            .iter()
            .position(|c| c.id == choice.target_id)
            .ok_or("Unknown earlier card")?;
        if to >= from {
            return Err("Duplicate target must be an earlier card".into());
        }
        match choice.action.as_str() {
            "keep" => {}
            "skip" | "replace" => {
                let incoming = deck.cards.remove(from);
                if choice.action == "replace" {
                    let prior = &mut deck.cards[to];
                    prior.question = incoming.question;
                    prior.answer = incoming.answer;
                    prior.question_image = incoming.question_image;
                    prior.answer_image = incoming.answer_image;
                    prior.question_audio = incoming.question_audio;
                    prior.answer_audio = incoming.answer_audio;
                }
                if let Some(stars) = deck
                    .meta
                    .get_mut("starredCards")
                    .and_then(|v| v.as_array_mut())
                {
                    let incoming_starred =
                        stars.iter().any(|v| v.as_str() == Some(&choice.card_id));
                    stars.retain(|v| v.as_str() != Some(&choice.card_id));
                    if choice.action == "replace"
                        && incoming_starred
                        && !stars.iter().any(|v| v.as_str() == Some(&choice.target_id))
                    {
                        stars.push(choice.target_id.into());
                    }
                }
            }
            _ => return Err("Unknown duplicate decision".into()),
        }
    }
    let names: HashSet<_> = deck
        .cover_image
        .iter()
        .chain(deck.cards.iter().flat_map(|c| {
            c.question_image
                .iter()
                .chain(c.answer_image.iter())
                .chain(c.question_audio.iter())
                .chain(c.answer_audio.iter())
        }))
        .cloned()
        .collect();
    Ok(Package {
        manifest: Manifest {
            format: package.manifest.format.clone(),
            version: package.manifest.version,
            deck,
        },
        media: package
            .media
            .iter()
            .filter(|(name, _)| names.contains(*name))
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    fn fixture() -> Package {
        let png = include_bytes!("../icons/32x32.png").to_vec();
        let mut webp = std::io::Cursor::new(Vec::new());
        image::load_from_memory(&png)
            .unwrap()
            .write_to(&mut webp, image::ImageFormat::WebP)
            .unwrap();
        let deck: Deck=serde_json::from_value(serde_json::json!({
          "id":"set-original","title":"Français / Română","subject":"Languages","color":"#ff6633","favorite":true,
          "coverImage":"cover.png","createdAt":"2026-01-01T00:00:00Z",
          "meta":{"description":"Portable Unicode","tags":["é","ț"],"starredCards":["card-original"]},
          "cards":[{"id":"card-original","question":"café","answer":"față","status":"Learning","accuracy":50.0,"dueAt":"2026-01-01T00:00:00Z","intervalDays":1.0,"ease":2.5,"repetitions":2,"lapses":1,"questionImage":"cover.png","answerImage":"answer.webp"}]
        })).unwrap();
        Package {
            manifest: Manifest {
                format: "flint-set".into(),
                version: 1,
                deck,
            },
            media: HashMap::from([
                ("cover.png".into(), png),
                ("answer.webp".into(), webp.into_inner()),
            ]),
        }
    }
    #[test]
    fn portable_roundtrip_and_duplicate_import_preserve_content_media_and_stars() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("set.flint");
        let package = fixture();
        write_package(&path, &package).unwrap();
        write_package(&path, &package).unwrap(); // Replacing a chosen export works on Windows too.
        let parsed = read_package(&path).unwrap();
        assert_eq!(
            serde_json::to_value(&parsed.manifest.deck).unwrap(),
            serde_json::to_value(&package.manifest.deck).unwrap()
        );
        assert_eq!(parsed.media, package.media);
        let media_dir = dir.path().join("media");
        fs::create_dir(&media_dir).unwrap();
        let db_path = dir.path().join("library.sqlite3");
        let db = Db {
            conn: Mutex::new(open_db(&db_path).unwrap()),
            path: db_path.clone(),
            media_dir,
        };
        let first = import_package(&parsed, &db).unwrap();
        let second = import_package(&parsed, &db).unwrap();
        assert_ne!(first.id, second.id);
        assert_ne!(first.cards[0].id, second.cards[0].id);
        assert_eq!(first.meta["starredCards"][0], first.cards[0].id);
        assert_eq!(first.cards[0].accuracy, 50.0);
        assert_eq!(first.cards[0].answer, "față");
        assert_eq!(
            fs::read(db.media_dir.join(first.cover_image.as_ref().unwrap())).unwrap(),
            package.media["cover.png"]
        );
        assert_eq!(
            fs::read(
                db.media_dir
                    .join(first.cards[0].answer_image.as_ref().unwrap())
            )
            .unwrap(),
            package.media["answer.webp"]
        );
        drop(db);
        let conn = open_db(&db_path).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT created_at FROM decks WHERE id=?",
                [&first.id],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "2026-01-01T00:00:00Z"
        );
        assert_eq!(
            conn.query_row("SELECT COUNT(*) FROM decks", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
        assert_eq!(
            conn.query_row(
                "SELECT answer FROM cards WHERE id=?",
                [first.cards[0].id.clone()],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "față"
        );
    }
    #[test]
    fn audio_only_roundtrip_persistence_backup_and_cleanup() {
        let dir = tempdir().unwrap();
        let mut package = fixture();
        package.manifest.version = 2;
        let wav = b"RIFF0000WAVEfmt ".to_vec();
        package.media.insert("voice.wav".into(), wav.clone());
        package.manifest.deck.cards[0].question = String::new();
        package.manifest.deck.cards[0].question_audio = Some("voice.wav".into());
        package.manifest.deck.cards[0].answer_audio = Some("voice.wav".into());
        let path = dir.path().join("audio.flint");
        write_package(&path, &package).unwrap();
        let parsed = read_package(&path).unwrap();
        assert_eq!(parsed.media["voice.wav"], wav);
        let media_dir = dir.path().join("media");
        fs::create_dir(&media_dir).unwrap();
        let db_path = dir.path().join("db.sqlite3");
        let db = Db {
            conn: Mutex::new(open_db(&db_path).unwrap()),
            path: db_path.clone(),
            media_dir: media_dir.clone(),
        };
        let deck = import_package(&parsed, &db).unwrap();
        let name = deck.cards[0].question_audio.as_ref().unwrap().clone();
        assert_eq!(fs::read(media_dir.join(&name)).unwrap(), wav);
        db.conn
            .lock()
            .unwrap()
            .execute_batch("PRAGMA wal_checkpoint(FULL)")
            .unwrap();
        let backup = dir.path().join("audio.flintbackup");
        write_backup(&db_path, Some(&media_dir), &backup, "0.1.5").unwrap();
        let mut zip = ZipArchive::new(fs::File::open(backup).unwrap()).unwrap();
        let mut bytes = Vec::new();
        zip.by_name(&format!("media/{name}"))
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        assert_eq!(bytes, wav);
        drop(db);
        let mut conn = open_db(&db_path).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT question_audio FROM cards WHERE id=?",
                [&deck.cards[0].id],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            name
        );
        let mut deleted = deck.clone();
        deleted.meta["deletedAt"] = (Utc::now() - Duration::days(8)).to_rfc3339().into();
        persist_details(&conn, &deleted).unwrap();
        trash::prune(&mut conn, &media_dir, Utc::now()).unwrap();
        assert!(!media_dir.join(name).exists());
        assert_eq!(
            conn.query_row("SELECT count(*) FROM cards", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn duplicate_choices_preserve_identity_history_and_media_before_fresh_import_ids() {
        let mut package = fixture();
        let mut duplicate = package.manifest.deck.cards[0].clone();
        duplicate.id = "duplicate".into();
        duplicate.question = "CAFÉ".into();
        duplicate.repetitions = 0;
        package.manifest.deck.cards.push(duplicate);
        package.manifest.deck.meta["starredCards"] = serde_json::json!(["duplicate"]);
        let resolved = resolve_choices(
            &package,
            vec![DuplicateChoice {
                card_id: "duplicate".into(),
                target_id: "card-original".into(),
                action: "replace".into(),
            }],
        )
        .unwrap();
        validate(&resolved).unwrap();
        assert_eq!(resolved.manifest.deck.cards.len(), 1);
        assert_eq!(resolved.manifest.deck.cards[0].id, "card-original");
        assert_eq!(resolved.manifest.deck.cards[0].question, "CAFÉ");
        assert_eq!(resolved.manifest.deck.cards[0].repetitions, 2);
        assert_eq!(
            resolved.manifest.deck.meta["starredCards"][0],
            "card-original"
        );
        assert_eq!(resolved.media, package.media);
        let kept = resolve_choices(&package, vec![]).unwrap();
        assert_eq!(kept.manifest.deck.cards.len(), 2);
        assert!(resolve_choices(
            &package,
            vec![DuplicateChoice {
                card_id: "card-original".into(),
                target_id: "duplicate".into(),
                action: "skip".into()
            }]
        )
        .is_err());
    }
    #[test]
    fn rejects_invalid_version_missing_media_duplicate_ids_and_bad_metadata() {
        let mut corrupt = fixture();
        corrupt
            .media
            .insert("cover.png".into(), b"\x89PNG\r\n\x1a\n".to_vec());
        assert!(validate(&corrupt).is_err());
        let mut p = fixture();
        p.manifest.version = 999;
        assert!(validate(&p).is_err());
        let mut p = fixture();
        p.media.remove("cover.png");
        assert!(validate(&p).is_err());
        let mut p = fixture();
        p.manifest.deck.cards.push(p.manifest.deck.cards[0].clone());
        assert!(validate(&p).is_err());
        let mut p = fixture();
        p.manifest.deck.meta["tags"] = serde_json::json!("not an array");
        assert!(validate(&p).is_err());
        let mut p = fixture();
        p.media
            .insert("cover.png".into(), b"<script>alert(1)</script>".to_vec());
        assert!(validate(&p).is_err());
        let mut p = fixture();
        p.manifest.deck.cards[0].question_image = Some("../../secret.png".into());
        assert!(validate(&p).is_err());
    }
    #[test]
    fn rejects_unsafe_archives_and_corrupt_files_without_writes() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("bad.flint");
        fs::write(&path, b"not a zip").unwrap();
        assert!(read_package(&path).is_err());
        let mut zip = ZipWriter::new(fs::File::create(&path).unwrap());
        zip.start_file("../outside.txt", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"no").unwrap();
        zip.finish().unwrap();
        assert!(read_package(&path).is_err());
        assert!(!dir.path().join("outside.txt").exists());
        let mut zip = ZipWriter::new(fs::File::create(&path).unwrap());
        zip.start_file("manifest.json", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"{}").unwrap();
        zip.finish().unwrap();
        assert!(read_package(&path).is_err());
    }
    #[test]
    fn valid_presets_do_not_require_external_assets() {
        let mut p = fixture();
        p.manifest.deck.cover_image = Some("flint:preset/ember".into());
        assert!(validate(&p).is_ok());
        p.manifest.deck.cover_image = Some("https://example.org/remote.png".into());
        assert!(validate(&p).is_err());
    }
    #[test]
    fn failed_import_cleans_only_its_new_media() {
        let dir = tempdir().unwrap();
        let media_dir = dir.path().join("media");
        fs::create_dir(&media_dir).unwrap();
        fs::write(media_dir.join("existing.txt"), b"keep").unwrap();
        let db = Db {
            path: dir.path().join("unused.sqlite3"),
            media_dir: media_dir.clone(),
            conn: Mutex::new(Connection::open_in_memory().unwrap()),
        };
        assert!(import_package(&fixture(), &db).is_err());
        assert_eq!(fs::read_dir(&media_dir).unwrap().count(), 1);
        assert_eq!(fs::read(media_dir.join("existing.txt")).unwrap(), b"keep");
    }
}
