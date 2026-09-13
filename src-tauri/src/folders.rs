use super::*;
pub fn canonical(path: &str) -> Result<String, String> {
    if path.is_empty() {
        return Ok(String::new());
    }
    let parts: Vec<_> = path.split('/').map(str::trim).collect();
    if path.len() > 2000
        || parts.len() > 32
        || parts
            .iter()
            .any(|s| s.is_empty() || *s == "." || *s == ".." || s.chars().count() > 120)
    {
        return Err("Invalid folder path".into());
    }
    Ok(parts.join("/"))
}
pub fn destination(source: &str, parent: &str, name: &str) -> Result<String, String> {
    let source = canonical(source)?;
    let parent = canonical(parent)?;
    if source.is_empty() || parent == source || parent.starts_with(&(source + "/")) {
        return Err("A folder cannot move into itself or its descendants".into());
    }
    if name.contains('/') || name.trim().is_empty() {
        return Err("Invalid folder name".into());
    }
    canonical(&if parent.is_empty() {
        name.into()
    } else {
        format!("{parent}/{name}")
    })
}
pub fn register(c: &Connection, path: &str) -> Result<(), String> {
    let path = canonical(path)?;
    let mut parent = String::new();
    for name in path.split('/').filter(|s| !s.is_empty()) {
        let id = if parent.is_empty() {
            name.to_string()
        } else {
            format!("{parent}/{name}")
        };
        c.execute(
            "INSERT OR IGNORE INTO folders(id,name,parent_id,created_at) VALUES(?,?,?,?)",
            params![
                id,
                name,
                if parent.is_empty() {
                    None
                } else {
                    Some(&parent)
                },
                Utc::now().to_rfc3339()
            ],
        )
        .map_err(|e| e.to_string())?;
        parent = id;
    }
    Ok(())
}
#[tauri::command]
pub fn relocate_library_folder(
    source: String,
    parent: String,
    name: String,
    db: State<Db>,
) -> Result<(), String> {
    let mut c = db.conn.lock().map_err(|e| e.to_string())?;
    relocate(&mut c, &source, &parent, &name)
}
fn relocate(c: &mut Connection, source: &str, parent: &str, name: &str) -> Result<(), String> {
    let source = canonical(source)?;
    let target = destination(&source, parent, name)?;
    if source == target {
        return Ok(());
    }
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let decks = {
        let mut st = tx
            .prepare("SELECT id,metadata FROM decks")
            .map_err(|e| e.to_string())?;
        let rows = st
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    let mut changes = Vec::new();
    for (id, json) in decks {
        let mut meta: serde_json::Value = serde_json::from_str(&json).map_err(|e| e.to_string())?;
        let path = meta["folder"].as_str().unwrap_or("").to_string();
        if !meta["deletedAt"].is_string()
            && (path == target || path.starts_with(&(target.clone() + "/")))
        {
            return Err("Destination folder already exists".into());
        }
        if path == source || path.starts_with(&(source.clone() + "/")) {
            let next = format!("{}{}", target, &path[source.len()..]);
            canonical(&next)?;
            meta["folder"] = serde_json::json!(next);
            changes.push((id, meta, next));
        }
    }
    if changes.is_empty() {
        return Err("Folder no longer exists".into());
    }
    for (id, meta, next) in changes {
        register(&tx, &next)?;
        tx.execute(
            "UPDATE decks SET metadata=?,modified_at=? WHERE id=?",
            params![meta.to_string(), Utc::now().to_rfc3339(), id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cycles_invalid_paths_and_collisions_are_rejected() {
        assert!(destination("A", "A", "A").is_err());
        assert!(destination("A", "A/B/C", "A").is_err());
        assert!(canonical("A//B").is_err());
        assert_eq!(destination("A/B", "", "B").unwrap(), "B");
        let d = tempfile::tempdir().unwrap();
        let mut c = open_db(&d.path().join("db")).unwrap();
        for (id, path) in [("a", "A/B/C"), ("b", "Other/B")] {
            c.execute("INSERT INTO decks(id,title,subject,color,favorite,created_at,modified_at,metadata) VALUES(?,'Deck','','#fff',0,'x','x',?)",params![id,serde_json::json!({"folder":path}).to_string()]).unwrap();
        }
        assert!(relocate(&mut c, "A/B", "Other", "B").is_err());
        relocate(&mut c, "A/B", "", "Moved").unwrap();
        let metadata: String = c
            .query_row("SELECT metadata FROM decks WHERE id='a'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&metadata).unwrap()["folder"],
            "Moved/C"
        );
        assert!(relocate(&mut c, "Moved", "Moved/C", "Moved").is_err());
    }
}
