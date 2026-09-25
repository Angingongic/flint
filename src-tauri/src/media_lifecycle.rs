//! Reference-aware maintenance of managed media. Backups and source paths are never traversed.
use super::*;
use std::collections::BTreeSet;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Candidate { pub name: String, pub bytes: u64, pub modified: u128 }
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Scan { pub candidates: Vec<Candidate>, pub bytes: u64 }

fn collect(value: &serde_json::Value, names: &mut HashSet<String>) {
    match value {
        serde_json::Value::String(s) => { names.insert(s.clone()); },
        serde_json::Value::Array(values) => for v in values {collect(v,names);},
        serde_json::Value::Object(values) => for v in values.values() {collect(v,names);},
        _ => {}
    }
}
pub fn references(conn: &Connection) -> Result<HashSet<String>,String> {
    let mut names=HashSet::new();
    let mut st=conn.prepare("SELECT cover_image FROM decks UNION SELECT question_image FROM cards UNION SELECT answer_image FROM cards UNION SELECT question_audio FROM cards UNION SELECT answer_audio FROM cards UNION SELECT question_video FROM cards UNION SELECT answer_video FROM cards UNION SELECT name FROM media_protected").map_err(|e|e.to_string())?;
    for row in st.query_map([],|r|r.get::<_,Option<String>>(0)).map_err(|e|e.to_string())? {if let Some(s)=row.map_err(|e|e.to_string())? {names.insert(s);}}
    // Trashed decks remain in these tables. Saved study state can also contain media.
    let mut st=conn.prepare("SELECT structure_json FROM cards UNION ALL SELECT metadata FROM decks UNION ALL SELECT state_json FROM study_sessions UNION ALL SELECT result_json FROM test_attempts").map_err(|e|e.to_string())?;
    for row in st.query_map([],|r|r.get::<_,Option<String>>(0)).map_err(|e|e.to_string())? {
        if let Some(json)=row.map_err(|e|e.to_string())? {
            let value=serde_json::from_str(&json).map_err(|_|"Cannot safely scan media: invalid stored metadata")?;
            collect(&value,&mut names);
        }
    }
    Ok(names)
}
fn safe_name(name:&str)->bool {
    !name.is_empty() && !name.contains(['/', '\\', ':']) && !name.contains("..") &&
        Path::new(name).extension().and_then(|e|e.to_str()).is_some_and(|e|["png","jpg","jpeg","webp","gif","mp4","webm","mp3","m4a","wav","ogg"].contains(&e.to_ascii_lowercase().as_str()))
}
fn snapshot(entry: &fs::DirEntry) -> Result<Option<Candidate>,String> {
    if !entry.file_type().map_err(|e|e.to_string())?.is_file() {return Ok(None);}
    let Some(name)=entry.file_name().to_str().map(str::to_owned) else {return Ok(None)};
    if !safe_name(&name) {return Ok(None);}
    let meta=entry.metadata().map_err(|e|e.to_string())?;
    let modified=meta.modified().map_err(|e|e.to_string())?.duration_since(std::time::UNIX_EPOCH).map_err(|e|e.to_string())?.as_millis();
    Ok(Some(Candidate{name,bytes:meta.len(),modified}))
}
pub fn scan(conn:&Connection,media:&Path)->Result<Scan,String> {
    let names=references(conn)?;
    let mut candidates=vec![];
    for entry in fs::read_dir(media).map_err(|e|e.to_string())? {
        if let Some(file)=snapshot(&entry.map_err(|e|e.to_string())?)? {
            let parent=file.name.strip_suffix(".poster.jpg");
            if !names.contains(&file.name) && !parent.is_some_and(|p|names.contains(p)) {candidates.push(file);}
        }
    }
    candidates.sort_by(|a,b|a.name.cmp(&b.name));
    Ok(Scan{bytes:candidates.iter().map(|c|c.bytes).sum(),candidates})
}
pub fn cleanup(conn:&Connection,media:&Path,expected:&[Candidate])->Result<Scan,String> {
    // Re-read every reference and filesystem identity while holding the DB mutex.
    let current=scan(conn,media)?;
    let mut removed=vec![];
    for file in current.candidates {
        if !expected.contains(&file) {continue;}
        // Do not follow a substituted symlink or directory.
        let path=media.join(&file.name);
        if !fs::symlink_metadata(&path).map_err(|e|e.to_string())?.file_type().is_file() {continue;}
        fs::remove_file(path).map_err(|e|e.to_string())?;
        conn.execute("DELETE FROM media_retired WHERE name=?",[&file.name]).map_err(|e|e.to_string())?;
        conn.execute("DELETE FROM media_cleanup WHERE name=?",[&file.name]).map_err(|e|e.to_string())?;
        removed.push(file);
    }
    Ok(Scan{bytes:removed.iter().map(|c|c.bytes).sum(),candidates:removed})
}
#[tauri::command]
pub fn sync_draft_media(names:Vec<String>,db:State<Db>)->Result<(),String> {
    let mut conn=db.conn.lock().map_err(|e|e.to_string())?;
    let tx=conn.transaction().map_err(|e|e.to_string())?;
    tx.execute("DELETE FROM media_protected",[]).map_err(|e|e.to_string())?;
    for name in names.into_iter().filter(|s|safe_name(s)).collect::<BTreeSet<_>>() {tx.execute("INSERT INTO media_protected(name) VALUES(?)",[name]).map_err(|e|e.to_string())?;}
    tx.commit().map_err(|e|e.to_string())
}
#[tauri::command]
pub fn scan_unused_media(db:State<Db>)->Result<Scan,String> {let conn=db.conn.lock().map_err(|e|e.to_string())?;scan(&conn,&db.media_dir)}
#[tauri::command]
pub fn cleanup_unused_media(expected:Vec<Candidate>,db:State<Db>)->Result<Scan,String> {let conn=db.conn.lock().map_err(|e|e.to_string())?;cleanup(&conn,&db.media_dir,&expected)}
#[tauri::command]
pub fn cleanup_retired_media(db:State<Db>)->Result<Scan,String> {
    let conn=db.conn.lock().map_err(|e|e.to_string())?;
    let mut st=conn.prepare("SELECT DISTINCT name FROM media_retired UNION SELECT name FROM media_cleanup").map_err(|e|e.to_string())?;
    let retired=st.query_map([],|r|r.get::<_,String>(0)).map_err(|e|e.to_string())?.collect::<Result<HashSet<_>,_>>().map_err(|e|e.to_string())?;
    let candidates=scan(&conn,&db.media_dir)?.candidates.into_iter().filter(|c|retired.contains(&c.name)||c.name.strip_suffix(".poster.jpg").is_some_and(|n|retired.contains(n))).collect::<Vec<_>>();
    cleanup(&conn,&db.media_dir,&candidates)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scan_and_cleanup_preserve_trash_drafts_shared_media_backups_and_changed_files() {
        let dir=tempfile::tempdir().unwrap();let media=dir.path().join("media");fs::create_dir(&media).unwrap();
        let conn=open_db(&dir.path().join("db")).unwrap();
        let video=media.join("disposable.mp4");let file=fs::File::create(&video).unwrap();file.set_len(20*1024*1024).unwrap();drop(file);
        fs::write(media.join("disposable.mp4.poster.jpg"),b"poster").unwrap();
        fs::write(media.join("draft.png"),b"draft").unwrap();
        fs::write(media.join("changed.png"),b"old").unwrap();
        fs::write(dir.path().join("original.mp4"),b"original").unwrap();
        fs::write(dir.path().join("backup.flintbackup"),b"backup").unwrap();
        conn.execute("INSERT INTO media_protected VALUES('draft.png')",[]).unwrap();
        conn.execute("INSERT INTO decks(id,title,created_at,modified_at,cover_image,metadata) VALUES('trash','Trash','','','disposable.mp4','{\"deletedAt\":\"2026-09-20T00:00:00Z\"}')",[]).unwrap();
        assert_eq!(scan(&conn,&media).unwrap().candidates.len(),1);
        conn.execute("DELETE FROM decks WHERE id='trash'",[]).unwrap();
        let preview=scan(&conn,&media).unwrap();assert_eq!(preview.candidates.len(),3);assert!(preview.bytes>=20*1024*1024);
        fs::write(media.join("changed.png"),b"newer and longer").unwrap();
        conn.execute("INSERT INTO media_protected VALUES('disposable.mp4')",[]).unwrap();
        assert!(cleanup(&conn,&media,&preview.candidates).unwrap().candidates.is_empty());
        conn.execute("DELETE FROM media_protected WHERE name='disposable.mp4'",[]).unwrap();
        assert_eq!(cleanup(&conn,&media,&preview.candidates).unwrap().candidates.len(),2);
        assert!(media.join("draft.png").exists());assert!(media.join("changed.png").exists());
        assert_eq!(fs::read(dir.path().join("original.mp4")).unwrap(),b"original");assert!(dir.path().join("backup.flintbackup").exists());
    }
}
