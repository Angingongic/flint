//! Versioned portable sets: bounded ZIP + JSON + local media; never extracted paths or code.
use super::*;
use std::collections::HashMap;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};
const MAX_SET: u64 = 100 * 1024 * 1024;
const MAX_ENTRY: u64 = 25 * 1024 * 1024;
pub fn format_name(version: u32) -> Option<&'static str> {
    ["Prelude", "Aria", "Cadence", "Sonata", "Nocturne", "Coda", "Chorus", "Rhapsody"].get(version.checked_sub(1)? as usize).copied()
}
#[derive(Default, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormatMetadata {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    format_version: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    format_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    created_with_flint_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    minimum_flint_version: Option<String>,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    format: String,
    version: u32,
    deck: Deck,
    #[serde(flatten)]
    metadata: FormatMetadata,
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
    #[serde(flatten)]
    metadata: FormatMetadata,
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
        "gif" => return multimedia::valid_gif(bytes),
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
                .chain(c.question_video.iter())
                .chain(c.answer_video.iter())
                .chain(c.structure.as_ref().into_iter().flat_map(structured::image_refs))
        }))
        .map(String::as_str)
        .collect()
}
fn validate(package: &Package) -> Result<(), String> {
    let manifest = &package.manifest;
    let deck = &manifest.deck;
    if manifest.format != "flint-set" || !matches!(manifest.version, 1 | 2 | 3 | 4) {
        return Err("Unsupported Flint set format/version. Update Flint to open newer formats.".into());
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
        if let Some(value) = &c.structure {
            if manifest.version < 4 {
                return Err("Structured cards require Flint package version 4. Download Flint: https://github.com/Angingongic/flint/releases/latest".into());
            }
            structured::validate(value)?;
        }
        if c.id.is_empty()
            || c.id.len() > 180
            || !ids.insert(c.id.as_str())
            || c.question.len() > 100000
            || c.answer.len() > 100000
            || (c.question.trim().is_empty()
                && c.question_image.is_none()
                && c.question_audio.is_none()
                && c.question_video.is_none()
                && c.structure.is_none())
            || (c.answer.trim().is_empty()
                && c.answer_image.is_none()
                && c.answer_audio.is_none()
                && c.answer_video.is_none()
                && c.structure.is_none())
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
        for name in c.question_video.iter().chain(c.answer_video.iter()) {
            if manifest.version < 3
                || !package.media.get(name).is_some_and(|bytes| {
                    multimedia::valid_video(
                        Path::new(name)
                            .extension()
                            .and_then(|s| s.to_str())
                            .unwrap_or(""),
                        bytes,
                    )
                })
            {
                return Err("Invalid video or old package format".into());
            }
        }
        for name in c.question_audio.iter().chain(c.answer_audio.iter()) {
            if manifest.version < 2
                || (name.ends_with(".webm") && manifest.version < 3)
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
        for name in c
            .question_image
            .iter()
            .chain(c.answer_image.iter())
            .chain(c.structure.as_ref().into_iter().flat_map(structured::image_refs))
        {
            if (name.ends_with(".gif") && manifest.version < 3)
                || !package
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
                || multimedia::valid_video(
                    Path::new(name)
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or(""),
                    bytes,
                )
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
    read_package_with_repair(path, false)
}
fn read_package_with_repair(path: &Path, repair: bool) -> Result<Package, String> {
    if !path
        .extension()
        .and_then(|s| s.to_str())
        .is_some_and(|s| s.eq_ignore_ascii_case("flint"))
    {
        return Err("Choose a .flint study set, not a .flintbackup library backup".into());
    }
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > MAX_SET {
        return Err("Set exceeds 100 MB".into());
    }
    let mut signature=[0u8;4];
    if file.read_exact(&mut signature).is_err() || !signature.starts_with(b"PK") {
        return Err(serde_json::json!({"kind":"not-flint","detail":"The file is not a Flint ZIP container.","repairable":false}).to_string());
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
    let raw: serde_json::Value = serde_json::from_slice(&manifest.ok_or("Missing manifest")?)
        .map_err(|e| format!("Invalid manifest: {e}"))?;
    let issue = |kind: &str, detail: &str| serde_json::json!({"kind":kind,"version":raw.get("formatVersion").or_else(||raw.get("version")),"minimumFlintVersion":raw.get("minimumFlintVersion"),"detail":detail,"repairable":false}).to_string();
    if raw["format"] != "flint-set" { return Err(issue("not-flint", "The required flint-set manifest identity is missing.")); }
    // Historical packages always used `version`; no content-based inference exists.
    let version = raw.get("formatVersion").or_else(||raw.get("version")).and_then(|v|v.as_u64());
    if version.is_none_or(|v| !(1..=4).contains(&v)) { return Err(issue("unsupported", "Unsupported numeric/schema generation.")); }
    if raw.get("version").is_some() && raw.get("formatVersion").is_some() && raw["version"] != raw["formatVersion"] { return Err(issue("corrupt", "Conflicting format identifiers cannot be safely repaired.")); }
    let mut normalized = raw.clone();
    normalized["version"] = serde_json::json!(version.unwrap());
    // Only absent derived scheduling fields have deterministic import defaults.
    // Authored text, IDs, media, structure and existing progress are never repaired.
    let mut repaired = normalized.clone();
    let mut changes = false;
    if let Some(cards) = repaired["deck"]["cards"].as_array_mut() {
        for card in cards {
            if let Some(object) = card.as_object_mut() {
                for (key, value) in [("status",serde_json::json!("New")),("accuracy",serde_json::json!(0)),("dueAt",serde_json::json!("1970-01-01T00:00:00Z")),("intervalDays",serde_json::json!(0)),("ease",serde_json::json!(2.5)),("repetitions",serde_json::json!(0)),("lapses",serde_json::json!(0))] {
                    if !object.contains_key(key) { object.insert(key.into(),value); changes=true; }
                }
            }
        }
    }
    let source = if changes { repaired } else { normalized };
    let manifest = serde_json::from_value(source).map_err(|e| issue("corrupt", &format!("Invalid manifest: {e}")))?;
    let package = Package { manifest, media };
    validate(&package).map_err(|e| issue("corrupt", &e))?;
    if changes && !repair {
        return Err(serde_json::json!({"kind":"corrupt","version":version,"detail":"Missing derived study scheduling metadata. Original study content and media passed validation. Repair restores import defaults without changing study content.","repairable":true}).to_string());
    }
    Ok(package)
}
fn deduplicate_media(mut package: Package) -> Package {
    use std::hash::{Hash, Hasher};
    let mut unique: HashMap<String, Vec<u8>> = HashMap::new();
    let mut buckets: HashMap<(u64, String), Vec<String>> = HashMap::new();
    let mut aliases = HashMap::new();
    let mut entries: Vec<_> = package.media.into_iter().collect();
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    for (name, bytes) in entries {
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        bytes.hash(&mut hash);
        let extension = Path::new(&name)
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        let bucket = buckets.entry((hash.finish(), extension)).or_default();
        // Hashes are only an index. Exact bytes must match before sharing an entry.
        if let Some(existing) = bucket.iter().find(|key| unique.get(*key) == Some(&bytes)) {
            aliases.insert(name, existing.clone());
        } else {
            bucket.push(name.clone());
            unique.insert(name, bytes);
        }
    }
    for name in package.manifest.deck.cover_image.iter_mut().chain(
        package.manifest.deck.cards.iter_mut().flat_map(|c| {
            c.question_image
                .iter_mut()
                .chain(c.answer_image.iter_mut())
                .chain(c.question_audio.iter_mut())
                .chain(c.answer_audio.iter_mut())
                .chain(c.question_video.iter_mut())
                .chain(c.answer_video.iter_mut())
                .chain(c.structure.as_mut().into_iter().flat_map(structured::image_muts))
        }),
    ) {
        if let Some(canonical) = aliases.get(name) {
            *name = canonical.clone();
        }
    }
    package.media = unique;
    package
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
    // Stream compressed output to a sibling temporary file. The chosen destination
    // remains intact on failure, without a second full archive allocation in RAM.
    let temporary = path.with_file_name(format!(".flint-export-{}.tmp", Uuid::new_v4()));
    let file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        let mut zip = ZipWriter::new(file);
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("manifest.json", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(&manifest).map_err(|e| e.to_string())?;
        for (name, bytes) in &package.media {
            zip.start_file(format!("media/{name}"), options)
                .map_err(|e| e.to_string())?;
            zip.write_all(bytes).map_err(|e| e.to_string())?;
        }
        let file = zip.finish().map_err(|e| e.to_string())?;
        if file.metadata().map_err(|e| e.to_string())?.len() > MAX_SET {
            return Err("Compressed set exceeds 100 MB".into());
        }
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
        &deduplicate_media(Package {
            manifest: Manifest {
                format: "flint-set".into(),
                metadata: FormatMetadata { format_version: Some(4), format_name: Some("Sonata".into()), created_with_flint_version: Some(env!("CARGO_PKG_VERSION").into()), minimum_flint_version: Some("2.0.0".into()) },
                version: 4,
                deck,
            },
            media,
        }),
    )
}
#[tauri::command]
pub fn preview_flint(path: String, repair: Option<bool>, pending: State<PendingSet>) -> Result<Preview, String> {
    let package = (if repair.unwrap_or(false) { read_package_with_repair(Path::new(&path), true) } else { read_package(Path::new(&path)) }).map_err(|e| {
        if serde_json::from_str::<serde_json::Value>(&e).is_ok() { e } else {
            serde_json::json!({"kind":"corrupt","detail":e,"repairable":false}).to_string()
        }
    })?;
    let deck = package.manifest.deck.clone();
    let metadata = FormatMetadata { format_version: Some(package.manifest.version), format_name: format_name(package.manifest.version).map(str::to_string), ..package.manifest.metadata.clone() };
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
                .chain(c.question_video.iter())
                .chain(c.answer_video.iter())
                .chain(c.structure.as_ref().into_iter().flat_map(structured::image_refs))
        }))
        .collect();
    let media = package
        .media
        .iter()
        .filter(|(name, _)| preview_names.contains(name))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    *pending.0.lock().map_err(|e| e.to_string())? = Some((token.clone(), package));
    Ok(Preview { token, deck, media, metadata })
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
    deck.meta["sharedFlint"] = serde_json::json!(true);
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
        meta.remove("archived"); // Legacy packages return archived content to Library.
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
                    .chain(c.question_video.iter_mut())
                    .chain(c.answer_video.iter_mut())
                    .chain(c.structure.as_mut().into_iter().flat_map(structured::image_muts))
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
                    prior.question_video = incoming.question_video;
                    prior.answer_video = incoming.answer_video;
                    prior.structure = incoming.structure;
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
                .chain(c.question_video.iter())
                .chain(c.answer_video.iter())
                .chain(c.structure.as_ref().into_iter().flat_map(structured::image_refs))
        }))
        .cloned()
        .collect();
    Ok(Package {
        manifest: Manifest {
            format: package.manifest.format.clone(),
            version: package.manifest.version,
            metadata: package.manifest.metadata.clone(),
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
    fn raw_fixture(path: &Path, manifest: &serde_json::Value, media: &HashMap<String,Vec<u8>>) {
        let mut zip=ZipWriter::new(fs::File::create(path).unwrap());
        let options=SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("manifest.json",options).unwrap();zip.write_all(&serde_json::to_vec(manifest).unwrap()).unwrap();
        for(name,bytes) in media {zip.start_file(format!("media/{name}"),options).unwrap();zip.write_all(bytes).unwrap();}
        zip.finish().unwrap();
    }
    #[test]
    fn musical_identity_uses_historical_version_never_contents_or_display_name() {
        let dir=tempdir().unwrap();let path=dir.path().join("old.flint");let source=fixture();
        let mut raw=serde_json::to_value(&source.manifest).unwrap();
        for version in 1..=4 {raw["version"]=serde_json::json!(version);raw_fixture(&path,&raw,&source.media);assert_eq!(read_package(&path).unwrap().manifest.version,version);}
        assert_eq!(format_name(1),Some("Prelude"));assert_eq!(format_name(4),Some("Sonata"));assert_eq!(format_name(8),Some("Rhapsody"));assert_eq!(format_name(9),None);
        raw["formatName"]=serde_json::json!("Fake");raw["formatVersion"]=serde_json::json!(5);raw["version"]=serde_json::json!(5);raw["minimumFlintVersion"]=serde_json::json!("2.3.0");
        raw_fixture(&path,&raw,&source.media);
        let issue:serde_json::Value=serde_json::from_str(&read_package(&path).err().unwrap()).unwrap();assert_eq!(issue["kind"],"unsupported");assert_eq!(issue["version"],5);assert_eq!(issue["minimumFlintVersion"],"2.3.0");
        raw.as_object_mut().unwrap().remove("version");raw.as_object_mut().unwrap().remove("formatVersion");raw_fixture(&path,&raw,&source.media);assert!(read_package(&path).is_err());
    }
    #[test]
    fn repair_restores_only_missing_derived_metadata_and_never_modifies_original() {
        let dir=tempdir().unwrap();let path=dir.path().join("repair.flint");let source=fixture();let mut raw=serde_json::to_value(&source.manifest).unwrap();
        raw["deck"]["cards"][0].as_object_mut().unwrap().remove("accuracy");raw_fixture(&path,&raw,&source.media);let original=fs::read(&path).unwrap();
        let issue:serde_json::Value=serde_json::from_str(&read_package(&path).err().unwrap()).unwrap();assert_eq!(issue["repairable"],true);
        let repaired=read_package_with_repair(&path,true).unwrap();assert_eq!(repaired.manifest.deck.cards[0].question,source.manifest.deck.cards[0].question);assert_eq!(repaired.media,source.media);assert_eq!(fs::read(&path).unwrap(),original);
        raw["deck"]["cards"][0].as_object_mut().unwrap().remove("answer");raw_fixture(&path,&raw,&source.media);assert!(read_package_with_repair(&path,true).is_err());
        fs::write(&path,b"not a Flint file").unwrap();let issue:serde_json::Value=serde_json::from_str(&read_package(&path).err().unwrap()).unwrap();assert_eq!(issue["kind"],"not-flint");
    }
    #[test]
    fn compressed_packages_deduplicate_exact_bytes_without_transcoding() {
        let dir=tempdir().unwrap();let path=dir.path().join("compressed.flint");let mut source=fixture();
        let original=source.media["cover.png"].clone();source.media.remove("answer.webp");source.media.insert("copy.png".into(),original.clone());source.manifest.deck.cards[0].answer_image=Some("copy.png".into());source.manifest.deck.cards[0].question="Repeated text ".repeat(600);
        let package=deduplicate_media(source);assert_eq!(package.media.len(),1);validate(&package).unwrap();
        let raw_size=serde_json::to_vec(&package.manifest).unwrap().len()+original.len();write_package(&path,&package).unwrap();let compressed=fs::metadata(&path).unwrap().len() as usize;
        assert!(compressed<raw_size);let restored=read_package(&path).unwrap();assert_eq!(restored.media.values().next().unwrap(),&original);
        eprintln!("Lossless text + PNG fixture: {raw_size} bytes -> {compressed} bytes; duplicate PNG stored once");
    }
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
                metadata: FormatMetadata::default(),
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
    fn multimedia_v3_roundtrip_reopen_backup_and_cleanup() {
        let dir = tempdir().unwrap();
        let mut package = fixture();
        package.manifest.version = 3;
        let gif=b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff\x21\xf9\x04\x00\x00\x00\x00\x00\x2c\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02\x44\x01\x00\x3b".to_vec();
        let mp4 = b"\x00\x00\x00\x18ftypisom".to_vec();
        let voice = vec![0x1a, 0x45, 0xdf, 0xa3, 0x80];
        package.media.insert("animation.gif".into(), gif.clone());
        package.media.insert("clip.mp4".into(), mp4.clone());
        package.media.insert("recording.webm".into(), voice.clone());
        let card = &mut package.manifest.deck.cards[0];
        card.question = String::new();
        card.answer = String::new();
        card.question_image = Some("animation.gif".into());
        card.question_video = Some("clip.mp4".into());
        card.answer_video = Some("clip.mp4".into());
        card.question_audio = Some("recording.webm".into());
        let path = dir.path().join("multimedia.flint");
        write_package(&path, &package).unwrap();
        let parsed = read_package(&path).unwrap();
        assert_eq!(parsed.media, package.media);
        let media_dir = dir.path().join("media");
        fs::create_dir(&media_dir).unwrap();
        let db_path = dir.path().join("library.sqlite3");
        let db = Db {
            conn: Mutex::new(open_db(&db_path).unwrap()),
            path: db_path.clone(),
            media_dir: media_dir.clone(),
        };
        let deck = import_package(&parsed, &db).unwrap();
        assert_eq!(deck.meta["sharedFlint"], true);
        let refs = [
            (deck.cards[0].question_image.clone().unwrap(), gif),
            (deck.cards[0].question_video.clone().unwrap(), mp4),
            (deck.cards[0].question_audio.clone().unwrap(), voice),
        ];
        for (name, bytes) in &refs {
            assert_eq!(fs::read(media_dir.join(name)).unwrap(), *bytes);
        }
        db.conn
            .lock()
            .unwrap()
            .execute_batch("PRAGMA wal_checkpoint(FULL)")
            .unwrap();
        let backup = dir.path().join("multimedia.flintbackup");
        write_backup(&db_path, Some(&media_dir), &backup, "0.1.8").unwrap();
        let mut zip = ZipArchive::new(fs::File::open(backup).unwrap()).unwrap();
        for (name, expected) in &refs {
            let mut bytes = Vec::new();
            zip.by_name(&format!("media/{name}"))
                .unwrap()
                .read_to_end(&mut bytes)
                .unwrap();
            assert_eq!(bytes, *expected);
        }
        drop(db);
        let mut c = open_db(&db_path).unwrap();
        let persisted: (String, String, String) = c
            .query_row(
                "SELECT question_image,question_video,question_audio FROM cards WHERE id=?",
                [&deck.cards[0].id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            persisted,
            (refs[0].0.clone(), refs[1].0.clone(), refs[2].0.clone())
        );
        let mut deleted = deck;
        deleted.meta["deletedAt"] = (Utc::now() - Duration::days(8)).to_rfc3339().into();
        persist_details(&c, &deleted).unwrap();
        trash::prune(&mut c, &media_dir, Utc::now()).unwrap();
        for (name, _) in refs {
            assert!(!media_dir.join(name).exists());
        }
        package.manifest.version = 2;
        assert!(write_package(&path, &package).is_err());
    }
    #[test]
    fn archive_retirement_migration_preserves_legacy_cards_and_folders() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("legacy.sqlite3");
        let mut c = open_db(&path).unwrap();
        let package = fixture();
        persist_deck(&mut c, &package.manifest.deck, None).unwrap();
        c.execute_batch("UPDATE decks SET metadata=json_set(metadata,'$.archived',json('true'),'$.folder','Science/Cells'); ALTER TABLE cards DROP COLUMN structure_json; PRAGMA user_version=8;").unwrap();
        drop(c);
        let c = open_db(&path).unwrap();
        let metadata: String = c
            .query_row("SELECT metadata FROM decks", [], |r| r.get(0))
            .unwrap();
        let metadata: serde_json::Value = serde_json::from_str(&metadata).unwrap();
        assert!(metadata.get("archived").is_none());
        assert_eq!(metadata["folder"], "Science/Cells");
        let answer: String = c
            .query_row("SELECT answer FROM cards", [], |r| r.get(0))
            .unwrap();
        assert_eq!(answer, "față");
    }
    #[test]
    fn structured_v4_roundtrip_reopen_backup_and_media_retention() {
        let dir = tempdir().unwrap();
        let mut package = fixture();
        package.manifest.version = 4;
        let card = &mut package.manifest.deck.cards[0];
        card.structure = Some(
            serde_json::json!({"version":1,"type":"occlusion","title":"Cell","image":"answer.webp","regions":[{"id":"nucleus","x":0.1,"y":0.2,"width":0.3,"height":0.4,"answer":"Nucleus","anchor":{"x":0.8,"y":0.7},"color":"#8b78ff","socket":"bottom"}]}),
        );
        card.question.clear();
        card.answer.clear();
        card.question_image = None;
        card.answer_image = None;
        let mut table = card.clone();
        table.id = "table-card".into();
        table.structure = Some(
            serde_json::json!({"version":1,"type":"table","title":"Elements","rows":[{"id":"r0","size":44},{"id":"r1","size":55}],"columns":[{"id":"c0","size":160},{"id":"c1","size":210}],"cells":{"r0:c0":"Element","r0:c1":"Symbol","r1:c0":"Hydrogen","r1:c1":"H"},"headerRow":true,"headerColumn":true,"gridLines":false}),
        );
        table.structure.as_mut().unwrap()["formats"] = serde_json::json!({"r1:c1":{"bold":true,"align":"center","background":"#123456","runs":[{"start":0,"end":1,"style":{"italic":true,"color":"#abcdef"}}]}});
        table.structure.as_mut().unwrap()["rows"][1]["name"] = "Named row".into();
        table.structure.as_mut().unwrap()["columns"][0]["name"] = "".into();
        table.structure.as_mut().unwrap()["extension"] = serde_json::json!({"preserve":"unknown structured metadata"});
        table.structure.as_mut().unwrap()["images"] = serde_json::json!({"r1:c0":"answer.webp"});
        table.structure.as_mut().unwrap()["imageLayouts"] = serde_json::json!({"r1:c0":{"x":12,"y":9,"width":96,"crop":{"x":0.1,"y":0.2,"width":0.7,"height":0.6}}});
        table.structure.as_mut().unwrap()["textPositions"] = serde_json::json!({"r1:c1":{"x":14,"y":8}});
        package.manifest.deck.cards.push(table);
        let path = dir.path().join("structured.flint");
        write_package(&path, &package).unwrap();
        let parsed = read_package(&path).unwrap();
        assert_eq!(parsed.media, package.media);
        assert_eq!(
            parsed.manifest.deck.cards[0].structure,
            package.manifest.deck.cards[0].structure
        );
        assert_eq!(
            parsed.manifest.deck.cards[1].structure,
            package.manifest.deck.cards[1].structure
        );
        let media = dir.path().join("media");
        fs::create_dir(&media).unwrap();
        let db_path = dir.path().join("library.sqlite3");
        let db = Db {
            conn: Mutex::new(open_db(&db_path).unwrap()),
            path: db_path.clone(),
            media_dir: media.clone(),
        };
        let mut imported = import_package(&parsed, &db).unwrap();
        let source = structured::image(imported.cards[0].structure.as_ref().unwrap())
            .unwrap()
            .to_string();
        assert_ne!(source, "answer.webp");
        assert_eq!(imported.cards[1].structure.as_ref().unwrap()["images"]["r1:c0"],source);
        assert_eq!(
            fs::read(media.join(&source)).unwrap(),
            package.media["answer.webp"]
        );
        let mut duplicate = imported.cards[0].clone();
        duplicate.id = "copy-card".into();
        imported.cards.push(duplicate);
        imported.cards.swap(0, 1);
        {
            let mut c = db.conn.lock().unwrap();
            persist_deck(&mut c, &imported, None).unwrap();
            c.execute_batch("PRAGMA wal_checkpoint(FULL)").unwrap();
        }
        let backup = dir.path().join("structured.flintbackup");
        write_backup(&db_path, Some(&media), &backup, "0.1.9").unwrap();
        let mut zip = ZipArchive::new(fs::File::open(backup).unwrap()).unwrap();
        let mut bytes = Vec::new();
        zip.by_name(&format!("media/{source}"))
            .unwrap()
            .read_to_end(&mut bytes)
            .unwrap();
        assert_eq!(bytes, package.media["answer.webp"]);
        drop(db);
        let mut c = open_db(&db_path).unwrap();
        for card in &imported.cards {
            let saved: String = c
                .query_row(
                    "SELECT structure_json FROM cards WHERE id=?",
                    [&card.id],
                    |r| r.get(0),
                )
                .unwrap();
            assert_eq!(
                serde_json::from_str::<serde_json::Value>(&saved).unwrap(),
                card.structure.clone().unwrap()
            );
        }
        let before = imported.cards.clone();
        imported.cards[0].structure.as_mut().unwrap()["version"] = serde_json::json!(99);
        assert!(persist_deck(&mut c, &imported, None).is_err());
        imported.cards = before;
        // Deleting one referencing card must not remove media used by its duplicate.
        imported.cards.remove(1);
        persist_deck(&mut c, &imported, None).unwrap();
        trash::prune(&mut c, &media, Utc::now()).unwrap();
        assert!(media.join(&source).exists());
        imported.meta["deletedAt"] = (Utc::now() - Duration::days(8)).to_rfc3339().into();
        persist_details(&c, &imported).unwrap();
        trash::prune(&mut c, &media, Utc::now()).unwrap();
        assert!(!media.join(&source).exists());
        package.manifest.version = 3;
        assert!(write_package(&path, &package).is_err());
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
