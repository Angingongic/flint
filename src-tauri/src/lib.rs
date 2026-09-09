use chrono::{DateTime, Duration, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Emitter, Manager, State};
mod portable;
use portable::{cancel_flint, export_flint, import_flint, preview_flint, PendingSet};
struct OpenedSets(Mutex<Vec<String>>);
fn queue_sets(app: &tauri::AppHandle, paths: Vec<String>) {
    if let Ok(mut pending) = app.state::<OpenedSets>().0.lock() {
        pending.extend(
            paths
                .into_iter()
                .filter(|p| p.to_ascii_lowercase().ends_with(".flint"))
                .take(20),
        );
        pending.truncate(20);
    }
    let _ = app.emit("flint-opened", ());
}
#[tauri::command]
fn opened_sets(state: State<OpenedSets>) -> Result<Vec<String>, String> {
    Ok(std::mem::take(
        &mut *state.0.lock().map_err(|e| e.to_string())?,
    ))
}
use uuid::Uuid;

const SCHEMA_VERSION: i64 = 5;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: String,
    pub question: String,
    pub answer: String,
    pub status: String,
    pub accuracy: f64,
    pub due_at: String,
    pub interval_days: f64,
    pub ease: f64,
    pub repetitions: i64,
    pub lapses: i64,
    pub last_reviewed: Option<String>,
    pub source_name: Option<String>,
    pub source_location: Option<String>,
    pub question_image: Option<String>,
    pub answer_image: Option<String>,
}
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Deck {
    pub id: String,
    pub title: String,
    pub subject: String,
    pub color: String,
    pub cards: Vec<Card>,
    pub favorite: bool,
    pub last_studied: Option<String>,
    pub cover_image: Option<String>,
    #[serde(default)]
    pub meta: serde_json::Value,
    #[serde(default)]
    pub created_at: Option<String>,
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewInput {
    pub card_id: String,
    pub rating: String,
    pub correct: bool,
    pub response_time_ms: i64,
    pub user_answer: String,
}
#[derive(Debug, Serialize, Deserialize, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub state: String,
    pub due_at: String,
    pub interval_days: f64,
    pub ease: f64,
    pub repetitions: i64,
    pub lapses: i64,
}
pub struct Db {
    path: PathBuf,
    media_dir: PathBuf,
    conn: Mutex<Connection>,
}

fn open_db(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?
    }
    let c = Connection::open(path).map_err(|e| e.to_string())?;
    c.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    c.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    migrate(&c)?;
    Ok(c)
}
fn migrate(c: &Connection) -> Result<(), String> {
    debug_assert_eq!(SCHEMA_VERSION, 5);
    let current: i64 = c
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if current < 1 {
        c.execute_batch(r#"BEGIN;
CREATE TABLE IF NOT EXISTS folders(id TEXT PRIMARY KEY,name TEXT NOT NULL,parent_id TEXT,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS decks(id TEXT PRIMARY KEY,title TEXT NOT NULL,subject TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '#EF6C3A',favorite INTEGER NOT NULL DEFAULT 0,last_studied TEXT,created_at TEXT NOT NULL,modified_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cards(id TEXT PRIMARY KEY,deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,question TEXT NOT NULL,answer TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'New',accuracy REAL NOT NULL DEFAULT 0,due_at TEXT NOT NULL,interval_days REAL NOT NULL DEFAULT 0,ease REAL NOT NULL DEFAULT 2.5,repetitions INTEGER NOT NULL DEFAULT 0,lapses INTEGER NOT NULL DEFAULT 0,last_reviewed TEXT,source_name TEXT,source_location TEXT,created_at TEXT NOT NULL,modified_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,reviewed_at TEXT NOT NULL,rating TEXT NOT NULL,correct INTEGER NOT NULL,response_time_ms INTEGER NOT NULL,user_answer TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tags(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS card_tags(card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,PRIMARY KEY(card_id,tag_id));
CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,deck_id TEXT REFERENCES decks(id) ON DELETE SET NULL,source TEXT NOT NULL,card_count INTEGER NOT NULL,imported_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cards_deck ON cards(deck_id);CREATE INDEX IF NOT EXISTS idx_cards_due ON cards(due_at);CREATE INDEX IF NOT EXISTS idx_reviews_card_time ON reviews(card_id,reviewed_at);PRAGMA user_version=1;COMMIT;"#).map_err(|e|e.to_string())?
    }
    if current < 2 {
        c.execute_batch("BEGIN;CREATE INDEX IF NOT EXISTS idx_cards_accuracy ON cards(accuracy);PRAGMA user_version=2;COMMIT;").map_err(|e|e.to_string())?
    }
    if current < 3 {
        c.execute_batch(
            "BEGIN;
             DELETE FROM decks WHERE id IN ('bio','history','spanish');
             PRAGMA user_version=3;
             COMMIT;",
        )
        .map_err(|e| e.to_string())?
    }
    if current < 4 {
        let has_column = |table: &str, column: &str| -> Result<bool, String> {
            let mut statement = c
                .prepare(&format!("PRAGMA table_info({table})"))
                .map_err(|e| e.to_string())?;
            let names = statement
                .query_map([], |row| row.get::<_, String>(1))
                .map_err(|e| e.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?;
            Ok(names.iter().any(|name| name == column))
        };
        if !has_column("decks", "cover_image")? {
            c.execute("ALTER TABLE decks ADD COLUMN cover_image TEXT", [])
                .map_err(|e| e.to_string())?;
        }
        if !has_column("cards", "question_image")? {
            c.execute("ALTER TABLE cards ADD COLUMN question_image TEXT", [])
                .map_err(|e| e.to_string())?;
        }
        if !has_column("cards", "answer_image")? {
            c.execute("ALTER TABLE cards ADD COLUMN answer_image TEXT", [])
                .map_err(|e| e.to_string())?;
        }
        c.execute_batch(
            "BEGIN;
             CREATE TABLE IF NOT EXISTS study_sessions(id TEXT PRIMARY KEY,deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,mode TEXT NOT NULL,state_json TEXT NOT NULL,updated_at TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS test_attempts(id TEXT PRIMARY KEY,deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,score INTEGER NOT NULL,total INTEGER NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL);
             PRAGMA user_version=4;
             COMMIT;",
        ).map_err(|e|e.to_string())?
    }
    if current < 5 {
        let exists: i64 = c
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('decks') WHERE name='metadata'",
                [],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if exists == 0 {
            c.execute(
                "ALTER TABLE decks ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'",
                [],
            )
            .map_err(|e| e.to_string())?;
        }
        c.pragma_update(None, "user_version", 5)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn schedule_review(old: &Schedule, rating: &str, now: DateTime<Utc>) -> Schedule {
    let mut s = old.clone();
    s.repetitions += 1;
    match rating.to_lowercase().as_str() {
        "again" | "didn't know" => {
            s.state = "Learning".into();
            s.interval_days = 0.007;
            s.ease = (s.ease - 0.2).max(1.3);
            s.lapses += 1
        }
        "hard" => {
            s.state = "Learning".into();
            s.interval_days = if s.interval_days < 1.0 {
                0.25
            } else {
                (s.interval_days * 1.2).max(1.0)
            };
            s.ease = (s.ease - 0.15).max(1.3)
        }
        "easy" => {
            s.interval_days = if s.interval_days < 1.0 {
                4.0
            } else {
                s.interval_days * s.ease * 1.3
            };
            s.ease = (s.ease + 0.15).min(3.0);
            s.state = if s.interval_days >= 30.0 {
                "Mastered".into()
            } else {
                "Review".into()
            }
        }
        _ => {
            s.interval_days = if s.interval_days < 1.0 {
                1.0
            } else if s.repetitions <= 2 {
                3.0
            } else {
                s.interval_days * s.ease
            };
            s.state = if s.interval_days >= 30.0 {
                "Mastered".into()
            } else {
                "Review".into()
            }
        }
    }
    s.due_at = (now + Duration::seconds((s.interval_days * 86400.0) as i64)).to_rfc3339();
    s
}
fn row_card(r: &rusqlite::Row) -> rusqlite::Result<Card> {
    Ok(Card {
        id: r.get(0)?,
        question: r.get(1)?,
        answer: r.get(2)?,
        status: r.get(3)?,
        accuracy: r.get(4)?,
        due_at: r.get(5)?,
        interval_days: r.get(6)?,
        ease: r.get(7)?,
        repetitions: r.get(8)?,
        lapses: r.get(9)?,
        last_reviewed: r.get(10)?,
        source_name: r.get(11)?,
        source_location: r.get(12)?,
        question_image: r.get(13)?,
        answer_image: r.get(14)?,
    })
}

#[tauri::command]
fn list_decks(db: State<Db>) -> Result<Vec<Deck>, String> {
    let c = db.conn.lock().map_err(|e| e.to_string())?;
    let mut ds=c.prepare("SELECT id,title,subject,color,favorite,last_studied,cover_image,metadata,created_at FROM decks ORDER BY modified_at DESC").map_err(|e|e.to_string())?;
    let rows = ds
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get::<_, i64>(4)? != 0,
                r.get(5)?,
                r.get(6)?,
                r.get::<_, String>(7)?,
                r.get(8)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut out = vec![];
    for row in rows {
        let (id, title, subject, color, favorite, last_studied, cover_image, metadata, created_at) =
            row.map_err(|e| e.to_string())?;
        let mut st=c.prepare("SELECT id,question,answer,status,accuracy,due_at,interval_days,ease,repetitions,lapses,last_reviewed,source_name,source_location,question_image,answer_image FROM cards WHERE deck_id=? ORDER BY created_at").map_err(|e|e.to_string())?;
        let cards = st
            .query_map([&id], row_card)
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        out.push(Deck {
            id,
            title,
            subject,
            color,
            cards,
            favorite,
            last_studied,
            cover_image,
            meta: serde_json::from_str(&metadata).unwrap_or_default(),
            created_at,
        });
    }
    Ok(out)
}
#[tauri::command]
fn save_deck(deck: Deck, source: Option<String>, db: State<Db>) -> Result<(), String> {
    let mut c = db.conn.lock().map_err(|e| e.to_string())?;
    persist_deck(&mut c, &deck, source.as_deref())
}

#[tauri::command]
fn update_deck_details(deck: Deck, db: State<Db>) -> Result<(), String> {
    let c = db.conn.lock().map_err(|e| e.to_string())?;
    persist_details(&c, &deck)
}
fn persist_details(c: &Connection, deck: &Deck) -> Result<(), String> {
    let changed = c
        .execute(
            "UPDATE decks SET favorite=?,cover_image=?,metadata=?,modified_at=? WHERE id=?",
            params![
                deck.favorite,
                deck.cover_image,
                deck.meta.to_string(),
                Utc::now().to_rfc3339(),
                deck.id
            ],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("Set no longer exists".into());
    }
    Ok(())
}
#[tauri::command]
fn export_text(path: String, text: String) -> Result<(), String> {
    fs::write(path, text).map_err(|e| e.to_string())
}

fn persist_deck(c: &mut Connection, deck: &Deck, source: Option<&str>) -> Result<(), String> {
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let now = Utc::now().to_rfc3339();
    tx.execute("INSERT INTO decks(id,title,subject,color,favorite,last_studied,cover_image,created_at,modified_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,subject=excluded.subject,color=excluded.color,favorite=excluded.favorite,last_studied=excluded.last_studied,cover_image=excluded.cover_image,modified_at=excluded.modified_at",params![deck.id,deck.title,deck.subject,deck.color,deck.favorite,deck.last_studied,deck.cover_image,deck.created_at.as_deref().unwrap_or(&now),now]).map_err(|e|e.to_string())?;
    tx.execute(
        "UPDATE decks SET metadata=? WHERE id=?",
        params![deck.meta.to_string(), deck.id],
    )
    .map_err(|e| e.to_string())?;
    let retained: HashSet<&str> = deck.cards.iter().map(|card| card.id.as_str()).collect();
    let existing = {
        let mut statement = tx
            .prepare("SELECT id FROM cards WHERE deck_id=?")
            .map_err(|e| e.to_string())?;
        let rows = statement
            .query_map([&deck.id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };
    for card_id in existing {
        if !retained.contains(card_id.as_str()) {
            tx.execute("DELETE FROM cards WHERE id=?", [&card_id])
                .map_err(|e| e.to_string())?;
        }
    }
    for x in &deck.cards {
        tx.execute("INSERT INTO cards(id,deck_id,question,answer,status,accuracy,due_at,interval_days,ease,repetitions,lapses,last_reviewed,source_name,source_location,question_image,answer_image,created_at,modified_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET question=excluded.question,answer=excluded.answer,status=excluded.status,accuracy=excluded.accuracy,due_at=excluded.due_at,interval_days=excluded.interval_days,ease=excluded.ease,repetitions=excluded.repetitions,lapses=excluded.lapses,last_reviewed=excluded.last_reviewed,source_name=excluded.source_name,source_location=excluded.source_location,question_image=excluded.question_image,answer_image=excluded.answer_image,modified_at=excluded.modified_at",params![x.id,deck.id,x.question,x.answer,x.status,x.accuracy,x.due_at,x.interval_days,x.ease,x.repetitions,x.lapses,x.last_reviewed,x.source_name,x.source_location,x.question_image,x.answer_image,now,now]).map_err(|e|e.to_string())?;
    }
    if let Some(s) = source {
        tx.execute(
            "INSERT INTO imports(id,deck_id,source,card_count,imported_at) VALUES(?,?,?,?,?)",
            params![
                Uuid::new_v4().to_string(),
                deck.id,
                s,
                deck.cards.len(),
                now
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}
#[tauri::command]
fn record_review(input: ReviewInput, db: State<Db>) -> Result<Schedule, String> {
    let mut c = db.conn.lock().map_err(|e| e.to_string())?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let old = tx
        .query_row(
            "SELECT status,due_at,interval_days,ease,repetitions,lapses FROM cards WHERE id=?",
            [&input.card_id],
            |r| {
                Ok(Schedule {
                    state: r.get(0)?,
                    due_at: r.get(1)?,
                    interval_days: r.get(2)?,
                    ease: r.get(3)?,
                    repetitions: r.get(4)?,
                    lapses: r.get(5)?,
                })
            },
        )
        .map_err(|e| e.to_string())?;
    let now = Utc::now();
    let s = schedule_review(&old, &input.rating, now);
    let old_acc: f64 = tx
        .query_row(
            "SELECT accuracy FROM cards WHERE id=?",
            [&input.card_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let acc = if old.repetitions == 0 {
        if input.correct {
            100.0
        } else {
            0.0
        }
    } else {
        old_acc * 0.8 + if input.correct { 20.0 } else { 0.0 }
    };
    tx.execute("UPDATE cards SET status=?,due_at=?,interval_days=?,ease=?,repetitions=?,lapses=?,last_reviewed=?,accuracy=?,modified_at=? WHERE id=?",params![s.state,s.due_at,s.interval_days,s.ease,s.repetitions,s.lapses,now.to_rfc3339(),acc,now.to_rfc3339(),input.card_id]).map_err(|e|e.to_string())?;
    tx.execute("INSERT INTO reviews(id,card_id,reviewed_at,rating,correct,response_time_ms,user_answer) VALUES(?,?,?,?,?,?,?)",params![Uuid::new_v4().to_string(),input.card_id,now.to_rfc3339(),input.rating,input.correct,input.response_time_ms,input.user_answer]).map_err(|e|e.to_string())?;
    tx.execute("UPDATE decks SET last_studied=?,modified_at=? WHERE id=(SELECT deck_id FROM cards WHERE id=?)",params![now.to_rfc3339(),now.to_rfc3339(),input.card_id]).map_err(|e|e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(s)
}
#[tauri::command]
fn study_queue(kind: String, db: State<Db>) -> Result<Vec<Card>, String> {
    let c = db.conn.lock().map_err(|e| e.to_string())?;
    let sql = if kind == "weak" {
        "SELECT id,question,answer,status,accuracy,due_at,interval_days,ease,repetitions,lapses,last_reviewed,source_name,source_location FROM cards ORDER BY (lapses*20+(100-accuracy)+CASE WHEN datetime(due_at)<=datetime('now') THEN 30 ELSE 0 END) DESC LIMIT 100"
    } else {
        "SELECT id,question,answer,status,accuracy,due_at,interval_days,ease,repetitions,lapses,last_reviewed,source_name,source_location FROM cards WHERE datetime(due_at)<=datetime('now') ORDER BY due_at LIMIT 100"
    };
    let mut s = c.prepare(sql).map_err(|e| e.to_string())?;
    let cards = s
        .query_map([], row_card)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(cards)
}

fn write_backup(
    db_path: &Path,
    media_dir: Option<&Path>,
    dest: &Path,
    version: &str,
) -> Result<(), String> {
    let file = fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut z = zip::ZipWriter::new(file);
    let opt = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);
    z.start_file("metadata.json", opt)
        .map_err(|e| e.to_string())?;
    z.write_all(
        format!(
            "{{\"formatVersion\":1,\"appVersion\":\"{}\",\"createdAt\":\"{}\"}}",
            version,
            Utc::now().to_rfc3339()
        )
        .as_bytes(),
    )
    .map_err(|e| e.to_string())?;
    z.start_file("flint.sqlite3", opt)
        .map_err(|e| e.to_string())?;
    z.write_all(&fs::read(db_path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    if let Some(media_dir) = media_dir {
        if media_dir.exists() {
            for entry in fs::read_dir(media_dir).map_err(|e| e.to_string())? {
                let path = entry.map_err(|e| e.to_string())?.path();
                if !path.is_file() {
                    continue;
                }
                let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                    continue;
                };
                z.start_file(format!("media/{name}"), opt)
                    .map_err(|e| e.to_string())?;
                z.write_all(&fs::read(path).map_err(|e| e.to_string())?)
                    .map_err(|e| e.to_string())?;
            }
        }
    }
    z.finish().map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn prepare_update_backup(preferences: String, db: State<Db>) -> Result<(), String> {
    let _: serde_json::Value = serde_json::from_str(&preferences).map_err(|e| e.to_string())?;
    let dir = db
        .path
        .parent()
        .ok_or("Missing data directory")?
        .join("update-backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    // Hold the database mutex through checkpoint and copy, so pending writes
    // finish before the snapshot and no new write races the backup.
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA wal_checkpoint(FULL)")
        .map_err(|e| e.to_string())?;
    write_backup(
        &db.path,
        Some(&db.media_dir),
        &dir.join(format!("{id}.flintbackup")),
        env!("CARGO_PKG_VERSION"),
    )?;
    fs::write(dir.join(format!("{id}.preferences.json")), preferences)
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
fn create_backup(path: String, db: State<Db>) -> Result<(), String> {
    db.conn
        .lock()
        .map_err(|e| e.to_string())?
        .execute_batch("PRAGMA wal_checkpoint(FULL)")
        .map_err(|e| e.to_string())?;
    let p = PathBuf::from(path);
    if p.exists() {
        return Err("A backup already exists at that location".into());
    }
    write_backup(&db.path, Some(&db.media_dir), &p, env!("CARGO_PKG_VERSION"))
}
#[tauri::command]
fn restore_backup(path: String, db: State<Db>) -> Result<(), String> {
    let f = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut z = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
    let mut entry = z
        .by_name("flint.sqlite3")
        .map_err(|_| "Invalid Flint backup".to_string())?;
    let tmp = db.path.with_extension("restore.tmp");
    let mut out = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    drop(out);
    drop(entry);
    drop(open_db(&tmp)?);
    db.conn
        .lock()
        .map_err(|e| e.to_string())?
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE)")
        .map_err(|e| e.to_string())?;
    fs::copy(&db.path, db.path.with_extension("before-restore.sqlite3"))
        .map_err(|e| e.to_string())?;
    fs::copy(tmp, &db.path).map_err(|e| e.to_string())?;
    fs::create_dir_all(&db.media_dir).map_err(|e| e.to_string())?;
    for index in 0..z.len() {
        let mut media = z.by_index(index).map_err(|e| e.to_string())?;
        let name = media.name().to_string();
        let Some(file_name) = name.strip_prefix("media/") else {
            continue;
        };
        if file_name.is_empty() || file_name.contains('/') || file_name.contains('\\') {
            return Err("Invalid media path in Flint backup".into());
        }
        let mut output =
            fs::File::create(db.media_dir.join(file_name)).map_err(|e| e.to_string())?;
        std::io::copy(&mut media, &mut output).map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
fn extract_document(path: String) -> Result<String, String> {
    let p = PathBuf::from(path);
    match p
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "txt" => fs::read_to_string(p).map_err(|e| e.to_string()),
        "pdf" => pdf_extract::extract_text(p).map_err(|e| e.to_string()),
        "docx" => {
            let f = fs::File::open(p).map_err(|e| e.to_string())?;
            let mut z = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
            let mut xml = String::new();
            z.by_name("word/document.xml")
                .map_err(|e| e.to_string())?
                .read_to_string(&mut xml)
                .map_err(|e| e.to_string())?;
            let mut reader = quick_xml::Reader::from_str(&xml);
            let mut out = String::new();
            loop {
                match reader.read_event() {
                    Ok(quick_xml::events::Event::Text(t)) => {
                        out.push_str(&t.unescape().map_err(|e| e.to_string())?);
                        out.push(' ')
                    }
                    Ok(quick_xml::events::Event::End(e)) if e.name().as_ref() == b"p" => {
                        out.push('\n')
                    }
                    Ok(quick_xml::events::Event::Eof) => break,
                    Err(e) => return Err(e.to_string()),
                    _ => {}
                }
            }
            Ok(out)
        }
        _ => Err("Supported document types are PDF, DOCX, and TXT".into()),
    }
}

fn safe_image_extension(value: &str) -> Result<&'static str, String> {
    match value.to_ascii_lowercase().as_str() {
        "png" => Ok("png"),
        "jpg" | "jpeg" => Ok("jpg"),
        "webp" => Ok("webp"),
        _ => Err("Supported image types are PNG, JPG, and WebP".into()),
    }
}
#[tauri::command]
fn import_media(path: String, db: State<Db>) -> Result<String, String> {
    let source = PathBuf::from(path);
    let ext = safe_image_extension(source.extension().and_then(|x| x.to_str()).unwrap_or(""))?;
    let name = format!("{}.{}", Uuid::new_v4(), ext);
    fs::create_dir_all(&db.media_dir).map_err(|e| e.to_string())?;
    fs::copy(source, db.media_dir.join(&name)).map_err(|e| e.to_string())?;
    Ok(name)
}
#[tauri::command]
fn save_media_bytes(data: Vec<u8>, extension: String, db: State<Db>) -> Result<String, String> {
    if data.len() > 25 * 1024 * 1024 {
        return Err("Image is larger than 25 MB".into());
    }
    let ext = safe_image_extension(&extension)?;
    let name = format!("{}.{}", Uuid::new_v4(), ext);
    fs::create_dir_all(&db.media_dir).map_err(|e| e.to_string())?;
    fs::write(db.media_dir.join(&name), data).map_err(|e| e.to_string())?;
    Ok(name)
}
#[tauri::command]
fn media_path(name: String, db: State<Db>) -> Result<String, String> {
    if name.contains('/') || name.contains('\\') {
        return Err("Invalid media reference".into());
    }
    Ok(db.media_dir.join(name).to_string_lossy().to_string())
}
#[tauri::command]
fn save_study_session(
    deck_id: String,
    mode: String,
    state_json: String,
    db: State<Db>,
) -> Result<(), String> {
    let c = db.conn.lock().map_err(|e| e.to_string())?;
    c.execute("INSERT INTO study_sessions(id,deck_id,mode,state_json,updated_at)VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at",params![format!("{}:{}",deck_id,mode),deck_id,mode,state_json,Utc::now().to_rfc3339()]).map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
fn load_study_session(
    deck_id: String,
    mode: String,
    db: State<Db>,
) -> Result<Option<String>, String> {
    db.conn
        .lock()
        .map_err(|e| e.to_string())?
        .query_row(
            "SELECT state_json FROM study_sessions WHERE id=?",
            [format!("{}:{}", deck_id, mode)],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn record_test_attempt(
    deck_id: String,
    score: i64,
    total: i64,
    result_json: String,
    db: State<Db>,
) -> Result<(), String> {
    db.conn.lock().map_err(|e|e.to_string())?.execute("INSERT INTO test_attempts(id,deck_id,score,total,result_json,created_at)VALUES(?,?,?,?,?,?)",params![Uuid::new_v4().to_string(),deck_id,score,total,result_json,Utc::now().to_rfc3339()]).map_err(|e|e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OpenedSets(Mutex::new(Vec::new())))
        .manage(PendingSet::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            queue_sets(
                app,
                args.into_iter()
                    .skip(1)
                    .map(|p| {
                        let path = PathBuf::from(p);
                        if path.is_absolute() {
                            path
                        } else {
                            Path::new(&cwd).join(path)
                        }
                    })
                    .map(|p| p.to_string_lossy().to_string())
                    .collect(),
            );
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .setup(|app| {
            queue_sets(app.handle(), std::env::args().skip(1).collect());
            let dir = app.path().app_data_dir()?;
            fs::create_dir_all(&dir)?;
            let path = dir.join("flint.sqlite3");
            let media_dir = dir.join("media");
            fs::create_dir_all(&media_dir)?;
            let conn = open_db(&path).map_err(std::io::Error::other)?;
            app.manage(Db {
                path,
                media_dir,
                conn: Mutex::new(conn),
            });
            Ok(())
        })
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_decks,
            save_deck,
            update_deck_details,
            prepare_update_backup,
            export_text,
            record_review,
            study_queue,
            create_backup,
            restore_backup,
            extract_document,
            import_media,
            save_media_bytes,
            media_path,
            save_study_session,
            load_study_session,
            record_test_attempt,
            export_flint,
            preview_flint,
            import_flint,
            cancel_flint,
            opened_sets
        ])
        .build(tauri::generate_context!())
        .expect("error while running Flint")
        .run(|_app, _event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                queue_sets(
                    _app,
                    urls.into_iter()
                        .filter_map(|url| url.to_file_path().ok())
                        .map(|p| p.to_string_lossy().to_string())
                        .collect(),
                );
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    fn fresh() -> Schedule {
        Schedule {
            state: "New".into(),
            due_at: Utc::now().to_rfc3339(),
            interval_days: 0.0,
            ease: 2.5,
            repetitions: 0,
            lapses: 0,
        }
    }
    #[test]
    fn ratings() {
        let n = Utc::now();
        assert_eq!(schedule_review(&fresh(), "Again", n).state, "Learning");
        let skipped = schedule_review(&fresh(), "Didn't Know", n);
        assert_eq!(skipped.state, "Learning");
        assert_eq!(skipped.lapses, 1);
        assert!(skipped.interval_days < 1.0);
        assert_eq!(schedule_review(&fresh(), "Hard", n).interval_days, 0.25);
        assert_eq!(schedule_review(&fresh(), "Good", n).interval_days, 1.0);
        assert_eq!(schedule_review(&fresh(), "Easy", n).interval_days, 4.0)
    }
    #[test]
    fn failures() {
        let n = Utc::now();
        let x = schedule_review(&schedule_review(&fresh(), "Again", n), "Again", n);
        assert_eq!(x.lapses, 2);
        assert!(x.ease >= 1.3)
    }
    #[test]
    fn mastery_returns() {
        let n = Utc::now();
        let mut s = fresh();
        s.interval_days = 20.0;
        s.repetitions = 5;
        let x = schedule_review(&s, "Easy", n);
        assert_eq!(x.state, "Mastered");
        assert!(DateTime::parse_from_rfc3339(&x.due_at).unwrap() > n)
    }
    #[test]
    fn persistence_and_migrations() {
        let d = tempdir().unwrap();
        let p = d.path().join("x.db");
        {
            let c = open_db(&p).unwrap();
            c.execute("INSERT INTO decks(id,title,subject,color,favorite,created_at,modified_at)VALUES('d','Deck','','#fff',0,'x','x')",[]).unwrap();
        }
        {
            let c = open_db(&p).unwrap();
            let t: String = c
                .query_row("SELECT title FROM decks WHERE id='d'", [], |r| r.get(0))
                .unwrap();
            assert_eq!(t, "Deck");
            let v: i64 = c
                .query_row("PRAGMA user_version", [], |r| r.get(0))
                .unwrap();
            assert_eq!(v, SCHEMA_VERSION)
        }
    }
    #[test]
    fn deck_and_card_save_edit_delete_persist() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("workflow.db");
        let mut connection = open_db(&path).unwrap();
        let card = Card {
            id: "card-1".into(),
            question: "Mitochondria".into(),
            answer: "Produces ATP".into(),
            status: "New".into(),
            accuracy: 0.0,
            due_at: Utc::now().to_rfc3339(),
            interval_days: 0.0,
            ease: 2.5,
            repetitions: 0,
            lapses: 0,
            last_reviewed: None,
            source_name: None,
            source_location: None,
            question_image: None,
            answer_image: None,
        };
        let mut deck = Deck {
            id: "biology".into(),
            title: "Biology".into(),
            subject: "".into(),
            color: "#EF6C3A".into(),
            cards: vec![card],
            favorite: false,
            last_studied: None,
            cover_image: None,
            meta: serde_json::json!({"folder":"Science","deletedAt":null}),
            created_at: None,
        };
        persist_deck(&mut connection, &deck, None).unwrap();
        drop(connection);

        let mut reopened = open_db(&path).unwrap();
        let saved: (String, String) = reopened
            .query_row(
                "SELECT question,answer FROM cards WHERE deck_id='biology'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(saved, ("Mitochondria".into(), "Produces ATP".into()));

        deck.cards[0].answer = "Produces cellular ATP".into();
        persist_deck(&mut reopened, &deck, None).unwrap();
        let edited: String = reopened
            .query_row("SELECT answer FROM cards WHERE id='card-1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(edited, "Produces cellular ATP");

        // Metadata actions must never overwrite cards or remove study history.
        deck.cover_image = Some("flint:preset/iris".into());
        deck.meta = serde_json::json!({"folder":"Science","tags":["cells"],"deletedAt":"2026-09-07T00:00:00Z"});
        deck.cards[0].answer = "stale client copy".into();
        persist_details(&reopened, &deck).unwrap();
        let preserved: String = reopened
            .query_row("SELECT answer FROM cards WHERE id='card-1'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(preserved, "Produces cellular ATP");
        drop(reopened);
        let mut reopened = open_db(&path).unwrap();
        let (metadata, cover): (String, String) = reopened
            .query_row(
                "SELECT metadata,cover_image FROM decks WHERE id='biology'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert!(metadata.contains("deletedAt"));
        assert_eq!(cover, "flint:preset/iris");
        deck.meta["deletedAt"] = serde_json::Value::Null;
        persist_details(&reopened, &deck).unwrap();
        assert_eq!(
            reopened
                .query_row(
                    "SELECT COUNT(*) FROM cards WHERE deck_id='biology'",
                    [],
                    |r| r.get::<_, i64>(0)
                )
                .unwrap(),
            1
        );

        deck.cards.clear();
        persist_deck(&mut reopened, &deck, None).unwrap();
        let remaining: i64 = reopened
            .query_row(
                "SELECT COUNT(*) FROM cards WHERE deck_id='biology'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(remaining, 0);
    }
    #[test]
    fn backup_created() {
        let d = tempdir().unwrap();
        let p = d.path().join("x.db");
        drop(open_db(&p).unwrap());
        let b = d.path().join("x.flintbackup");
        write_backup(&p, None, &b, "0.1.0").unwrap();
        assert!(b.metadata().unwrap().len() > 100)
    }
    #[test]
    fn fixture_cleanup_migration_preserves_user_decks() {
        let d = tempdir().unwrap();
        let p = d.path().join("cleanup.db");
        let c = open_db(&p).unwrap();
        c.execute("INSERT INTO decks(id,title,subject,color,favorite,created_at,modified_at)VALUES('bio','Built-in fixture','','#fff',0,'x','x')", []).unwrap();
        c.execute("INSERT INTO decks(id,title,subject,color,favorite,created_at,modified_at)VALUES('user-deck','Biology','','#fff',0,'x','x')", []).unwrap();
        c.pragma_update(None, "user_version", 2).unwrap();
        drop(c);
        let reopened = open_db(&p).unwrap();
        let demo_count: i64 = reopened
            .query_row("SELECT COUNT(*) FROM decks WHERE id='bio'", [], |r| {
                r.get(0)
            })
            .unwrap();
        let user_count: i64 = reopened
            .query_row("SELECT COUNT(*) FROM decks WHERE id='user-deck'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(demo_count, 0);
        assert_eq!(user_count, 1);
    }
}
