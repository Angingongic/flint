use super::*;

pub struct Staged { dir: tempfile::TempDir, preview: Preview }
#[derive(Default)]
pub struct PendingBackup(Mutex<Option<Staged>>);
#[derive(Clone,Serialize)]
#[serde(rename_all="camelCase")]
pub struct Preview { token:String, sets:u64, cards:u64, media_files:u64, bytes:u64, app_version:String, has_preferences:bool }

fn stage(path:&Path,root:&Path)->Result<Staged,String>{
    let file=fs::File::open(path).map_err(|e|e.to_string())?;
    if file.metadata().map_err(|e|e.to_string())?.len()>4*1024*1024*1024 {return Err("Backup exceeds the 4 GiB safety limit".into());}
    let mut zip=zip::ZipArchive::new(file).map_err(|_|"Not a valid Flint backup")?;
    if zip.len()>50000 {return Err("Backup contains too many entries".into());}
    let dir=tempfile::Builder::new().prefix("restore-preview-").tempdir_in(root).map_err(|e|e.to_string())?;
    fs::create_dir(dir.path().join("media")).map_err(|e|e.to_string())?;
    let mut seen=HashSet::new();let mut total=0u64;let mut media_files=0;
    for index in 0..zip.len(){
        let mut entry=zip.by_index(index).map_err(|e|e.to_string())?;
        let name=entry.name().to_string();
        if !seen.insert(name.to_ascii_lowercase()) {return Err("Duplicate backup entry".into());}
        let legal=matches!(name.as_str(),"metadata.json"|"flint.sqlite3"|"preferences.json") || name.strip_prefix("media/").is_some_and(|n|!n.is_empty()&&!n.contains(['/', '\\', ':'])&&!n.contains(".."));
        if !legal || entry.is_dir() || entry.unix_mode().is_some_and(|m|m&0o170000==0o120000) {return Err("Unsafe or unknown backup entry".into());}
        total=total.checked_add(entry.size()).ok_or("Backup size overflow")?;
        let limit=if name=="flint.sqlite3" {512*1024*1024} else if name.starts_with("media/") {100*1024*1024} else {16*1024*1024};
        if entry.size()>limit || total>4*1024*1024*1024 {return Err("Backup expands beyond the safety limit".into());}
        let mut out=fs::File::create(dir.path().join(&name)).map_err(|e|e.to_string())?;
        let copied=std::io::copy(&mut entry,&mut out).map_err(|e|format!("Corrupt backup entry: {e}"))?;
        if copied>limit {return Err("Oversized backup entry".into());}
        out.sync_all().map_err(|e|e.to_string())?;
        if name.starts_with("media/"){media_files+=1;}
    }
    let metadata:serde_json::Value=serde_json::from_slice(&fs::read(dir.path().join("metadata.json")).map_err(|_|"Missing backup metadata")?).map_err(|_|"Invalid backup metadata")?;
    if metadata["formatVersion"]!=1 {return Err("Unsupported Flint backup format. Update Flint.".into());}
    let database=dir.path().join("flint.sqlite3");
    {
        let conn=Connection::open_with_flags(&database,rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).map_err(|_|"Invalid backup database")?;
        let integrity:String=conn.query_row("PRAGMA quick_check",[],|r|r.get(0)).map_err(|e|e.to_string())?;
        if integrity!="ok" {return Err("Corrupt backup database".into());}
        let count:i64=conn.query_row("SELECT count(*) FROM sqlite_master WHERE type='table' AND name IN ('decks','cards','reviews','preferences')",[],|r|r.get(0)).map_err(|e|e.to_string())?;
        if count!=4 {return Err("Not a Flint library database".into());}
        let version:i64=conn.query_row("PRAGMA user_version",[],|r|r.get(0)).map_err(|e|e.to_string())?;
        if version>SCHEMA_VERSION {return Err("This backup requires a newer Flint version".into());}
    }
    let conn=open_db(&database)?;
    if conn.prepare("PRAGMA foreign_key_check").map_err(|e|e.to_string())?.query([]).map_err(|e|e.to_string())?.next().map_err(|e|e.to_string())?.is_some(){return Err("Backup contains broken library references".into());}
    let mut st=conn.prepare("SELECT cover_image FROM decks UNION SELECT question_image FROM cards UNION SELECT answer_image FROM cards UNION SELECT question_audio FROM cards UNION SELECT answer_audio FROM cards UNION SELECT question_video FROM cards UNION SELECT answer_video FROM cards UNION SELECT json_extract(structure_json,'$.image') FROM cards WHERE json_extract(structure_json,'$.type')='occlusion'").map_err(|e|e.to_string())?;
    for row in st.query_map([],|r|r.get::<_,Option<String>>(0)).map_err(|e|e.to_string())? {if let Some(name)=row.map_err(|e|e.to_string())? {
        if name.starts_with("flint:preset/"){continue;}
        if name.is_empty()||name.contains(['/', '\\', ':'])||name.contains("..")||!dir.path().join("media").join(name).is_file(){return Err("Backup is missing referenced media".into());}
    }}drop(st);
    let mut st=conn.prepare("SELECT structure_json FROM cards WHERE structure_json IS NOT NULL").map_err(|e|e.to_string())?;
    for row in st.query_map([],|r|r.get::<_,String>(0)).map_err(|e|e.to_string())? {structured::validate(&serde_json::from_str(&row.map_err(|e|e.to_string())?).map_err(|_|"Invalid structured card in backup")?)?;}drop(st);
    for name in structured::stored_images(&conn,None)? {
        if name.is_empty()||name.contains(['/', '\\', ':'])||name.contains("..")||!dir.path().join("media").join(name).is_file(){return Err("Backup is missing referenced structured media".into());}
    }
    let has_preferences=dir.path().join("preferences.json").is_file();
    if has_preferences {
        let prefs:String=fs::read_to_string(dir.path().join("preferences.json")).map_err(|e|e.to_string())?;
        let parsed:serde_json::Value=serde_json::from_str(&prefs).map_err(|_|"Invalid backup preferences")?;
        if !parsed.as_object().is_some_and(|p|p.iter().all(|(k,v)|k.starts_with("flint-") && v.is_string())){return Err("Invalid backup preferences".into());}
        conn.execute("INSERT OR REPLACE INTO preferences(key,value) VALUES('__restore_browser_preferences',?)",[prefs]).map_err(|e|e.to_string())?;
    }
    let sets=conn.query_row("SELECT count(*) FROM decks",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    let cards=conn.query_row("SELECT count(*) FROM cards",[],|r|r.get(0)).map_err(|e|e.to_string())?;
    conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE)").map_err(|e|e.to_string())?;drop(conn);
    Ok(Staged{dir,preview:Preview{token:Uuid::new_v4().to_string(),sets,cards,media_files,bytes:total,app_version:metadata["appVersion"].as_str().unwrap_or("Unknown").into(),has_preferences}})
}
#[tauri::command]
pub fn preview_backup(path:String,db:State<Db>,pending:State<PendingBackup>)->Result<Preview,String>{
    let staged=stage(Path::new(&path),db.path.parent().ok_or("Missing app-data directory")?)?;
    let preview=staged.preview.clone();*pending.0.lock().map_err(|e|e.to_string())?=Some(staged);Ok(preview)
}
#[tauri::command]
pub fn queue_backup_restore(token:String,db:State<Db>,pending:State<PendingBackup>)->Result<(),String>{
    let mut guard=pending.0.lock().map_err(|e|e.to_string())?;
    let staged=guard.as_ref().filter(|s|s.preview.token==token).ok_or("Backup preview expired. Preview it again.")?;
    let root=db.path.parent().ok_or("Missing app-data directory")?;
    if root.join("pending-restore").exists(){return Err("A restore is already queued. Restart Flint first.".into());}
    // The validated snapshot, not the potentially changed source file, is queued.
    fs::rename(staged.dir.path(),root.join("pending-restore")).map_err(|e|e.to_string())?;
    *guard=None;Ok(())
}
/// Run before opening SQLite. Preserve the entire previous library for recovery.
pub fn apply_pending(root:&Path)->Result<(),String>{
    recover_interrupted(root)?;
    let pending=root.join("pending-restore");if !pending.is_dir(){return Ok(());}
    if !pending.join("flint.sqlite3").is_file() || !pending.join("media").is_dir(){return Err("Incomplete queued restore; original library has not been changed".into());}
    let recovery=root.join(format!("restore-recovery-{}",Uuid::new_v4()));fs::create_dir(&recovery).map_err(|e|e.to_string())?;
    let original=["flint.sqlite3","flint.sqlite3-wal","flint.sqlite3-shm","media"].into_iter().filter(|n|root.join(n).exists()).collect::<Vec<_>>();
    let journal=serde_json::json!({"recovery":recovery.file_name().unwrap().to_string_lossy(),"original":original});
    let mut record=fs::File::create(root.join("restore-journal.json")).map_err(|e|e.to_string())?;
    record.write_all(journal.to_string().as_bytes()).map_err(|e|e.to_string())?;record.sync_all().map_err(|e|e.to_string())?;drop(record);
    let mut old=vec![];let mut new=vec![];
    let result=(||->Result<(),std::io::Error>{
        for name in ["flint.sqlite3","flint.sqlite3-wal","flint.sqlite3-shm","media"]{if root.join(name).exists(){fs::rename(root.join(name),recovery.join(name))?;old.push(name);}}
        for name in ["flint.sqlite3","media"]{fs::rename(pending.join(name),root.join(name))?;new.push(name);}
        Ok(())
    })();
    if let Err(error)=result {
        let mut rollback_failed=false;
        for name in new.into_iter().rev(){rollback_failed|=fs::rename(root.join(name),pending.join(name)).is_err();}
        for name in old.into_iter().rev(){rollback_failed|=fs::rename(recovery.join(name),root.join(name)).is_err();}
        if !rollback_failed {let _=fs::remove_file(root.join("restore-journal.json"));}
        return Err(format!("Restore could not finish: {error}. Recovery library: {}. Rollback failed: {rollback_failed}",recovery.display()));
    }
    // Only staging metadata remains; keep it as a record, outside managed media.
    fs::rename(pending,recovery.join("restored-backup-metadata")).map_err(|e|e.to_string())?;
    fs::remove_file(root.join("restore-journal.json")).map_err(|e|e.to_string())?;
    Ok(())
}
fn recover_interrupted(root:&Path)->Result<(),String>{
    let journal=root.join("restore-journal.json");if !journal.is_file(){return Ok(());}
    let data:serde_json::Value=serde_json::from_slice(&fs::read(&journal).map_err(|e|e.to_string())?).map_err(|_|"Invalid restore journal; recovery required")?;
    let name=data["recovery"].as_str().ok_or("Invalid recovery folder")?;
    if !name.strip_prefix("restore-recovery-").is_some_and(|id|Uuid::parse_str(id).is_ok()){return Err("Invalid recovery folder".into());}
    let recovery=root.join(name);let pending=root.join("pending-restore");
    if recovery.join("restored-backup-metadata").is_dir(){fs::remove_file(journal).map_err(|e|e.to_string())?;return Ok(());}
    for item in ["flint.sqlite3","media"]{if !pending.join(item).exists() && root.join(item).exists(){fs::rename(root.join(item),pending.join(item)).map_err(|e|format!("Restore recovery requires attention: {e}"))?;}}
    for item in data["original"].as_array().ok_or("Invalid restore journal")? {
        let name=item.as_str().ok_or("Invalid restore journal")?;
        if !["flint.sqlite3","flint.sqlite3-wal","flint.sqlite3-shm","media"].contains(&name){return Err("Invalid restore journal".into());}
        if recovery.join(name).exists(){fs::rename(recovery.join(name),root.join(name)).map_err(|e|format!("Restore recovery requires attention: {e}"))?;}
    }
    fs::remove_file(journal).map_err(|e|e.to_string())?;Ok(())
}
#[tauri::command]
pub fn restored_preferences(db:State<Db>)->Result<Option<String>,String>{db.conn.lock().map_err(|e|e.to_string())?.query_row("SELECT value FROM preferences WHERE key='__restore_browser_preferences'",[],|r|r.get(0)).optional().map_err(|e|e.to_string())}
#[tauri::command]
pub fn acknowledge_restored_preferences(db:State<Db>)->Result<(),String>{db.conn.lock().map_err(|e|e.to_string())?.execute("DELETE FROM preferences WHERE key='__restore_browser_preferences'",[]).map_err(|e|e.to_string())?;Ok(())}

#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn interrupted_restore_recovers_at_every_move_boundary(){
        for completed in 0..=4 {
            let temp=tempfile::tempdir().unwrap();let root=temp.path();
            let pending=root.join("pending-restore");let recovery=root.join(format!("restore-recovery-{}",Uuid::new_v4()));
            fs::create_dir(&pending).unwrap();fs::create_dir(&recovery).unwrap();
            for (dir,label) in [(root,"original"),(pending.as_path(),"incoming")] {
                fs::write(dir.join("flint.sqlite3"),label).unwrap();
                fs::create_dir(dir.join("media")).unwrap();fs::write(dir.join("media/image.png"),label).unwrap();
            }
            let journal=serde_json::json!({"recovery":recovery.file_name().unwrap().to_str().unwrap(),"original":["flint.sqlite3","media"]});
            fs::write(root.join("restore-journal.json"),journal.to_string()).unwrap();
            let moves=[(root.join("flint.sqlite3"),recovery.join("flint.sqlite3")),(root.join("media"),recovery.join("media")),(pending.join("flint.sqlite3"),root.join("flint.sqlite3")),(pending.join("media"),root.join("media"))];
            for (from,to) in moves.iter().take(completed){fs::rename(from,to).unwrap();}
            recover_interrupted(root).unwrap();
            assert_eq!(fs::read(root.join("flint.sqlite3")).unwrap(),b"original","boundary {completed}");
            assert_eq!(fs::read(root.join("media/image.png")).unwrap(),b"original");
            assert_eq!(fs::read(pending.join("flint.sqlite3")).unwrap(),b"incoming");
            assert_eq!(fs::read(pending.join("media/image.png")).unwrap(),b"incoming");
            recover_interrupted(root).unwrap(); // idempotent after rollback
        }
    }
    #[test]
    fn incomplete_backup_never_changes_live_library(){
        let root=tempfile::tempdir().unwrap();let db=root.path().join("flint.sqlite3");
        let conn=open_db(&db).unwrap();conn.execute("INSERT INTO decks(id,title,created_at,modified_at,cover_image) VALUES('d','Keep me','','','missing.png')",[]).unwrap();drop(conn);
        let archive=root.path().join("missing.flintbackup");write_backup(&db,None,&archive,"2.0.0").unwrap();
        assert!(stage(&archive,root.path()).err().unwrap().contains("missing referenced media"));
        let conn=open_db(&db).unwrap();assert_eq!(conn.query_row("SELECT title FROM decks",[],|r|r.get::<_,String>(0)).unwrap(),"Keep me");
        assert!(!root.path().join("pending-restore").exists());
    }
    #[test]
    fn backup_restore_stages_validates_and_keeps_previous_library(){
        let root=tempfile::tempdir().unwrap();let db=root.path().join("flint.sqlite3");let media=root.path().join("media");fs::create_dir(&media).unwrap();
        let conn=open_db(&db).unwrap();conn.execute("INSERT INTO decks(id,title,created_at,modified_at,cover_image) VALUES('d','Before','','','image.png')",[]).unwrap();drop(conn);fs::write(media.join("image.png"),b"exact image").unwrap();
        let archive=root.path().join("backup.flintbackup");write_backup(&db,Some(&media),&archive,"0.1.8").unwrap();
        let staged=stage(&archive,root.path()).unwrap();assert_eq!(staged.preview.sets,1);
        let conn=open_db(&db).unwrap();conn.execute("UPDATE decks SET title='Later'",[]).unwrap();drop(conn);
        fs::rename(staged.dir.path(),root.path().join("pending-restore")).unwrap();apply_pending(root.path()).unwrap();
        let conn=open_db(&db).unwrap();assert_eq!(conn.query_row("SELECT title FROM decks",[],|r|r.get::<_,String>(0)).unwrap(),"Before");
        assert_eq!(fs::read(media.join("image.png")).unwrap(),b"exact image");
        let recovery=fs::read_dir(root.path()).unwrap().map(|e|e.unwrap().path()).find(|p|p.file_name().unwrap().to_string_lossy().starts_with("restore-recovery-")).unwrap();
        let old=open_db(&recovery.join("flint.sqlite3")).unwrap();assert_eq!(old.query_row("SELECT title FROM decks",[],|r|r.get::<_,String>(0)).unwrap(),"Later");
    }
}
