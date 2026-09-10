use super::*;
pub fn prune(
    conn: &mut Connection,
    media: &Path,
    now: DateTime<Utc>,
) -> Result<Vec<String>, String> {
    prune_with_target(conn, media, now, None)
}
fn prune_with_target(
    conn: &mut Connection,
    media: &Path,
    now: DateTime<Utc>,
    target: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut decks = {
        let mut st = conn
            .prepare("SELECT id,metadata FROM decks")
            .map_err(|e| e.to_string())?;
        let rows = st
            .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows.into_iter()
            .filter_map(|(id, json)| {
                let meta: serde_json::Value = serde_json::from_str(&json).ok()?;
                let deleted = DateTime::parse_from_rfc3339(meta["deletedAt"].as_str()?).ok()?;
                Some((id, deleted.with_timezone(&Utc)))
            })
            .collect::<Vec<_>>()
    };
    decks.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    let ids: Vec<_> = decks
        .into_iter()
        .enumerate()
        .filter(|(i, (id, date))| {
            target == Some(id.as_str())
                || *i >= 5
                || now.signed_duration_since(*date) >= Duration::days(7)
        })
        .map(|(_, (id, _))| id)
        .collect();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut images = HashSet::<String>::new();
    for id in &ids {
        let mut st=tx.prepare("SELECT cover_image FROM decks WHERE id=?1 UNION SELECT question_image FROM cards WHERE deck_id=?1 UNION SELECT answer_image FROM cards WHERE deck_id=?1 UNION SELECT question_audio FROM cards WHERE deck_id=?1 UNION SELECT answer_audio FROM cards WHERE deck_id=?1 UNION SELECT name FROM media_retired WHERE deck_id=?1").map_err(|e|e.to_string())?;
        for name in st
            .query_map([id], |r| r.get::<_, Option<String>>(0))
            .map_err(|e| e.to_string())?
        {
            if let Some(name) = name.map_err(|e| e.to_string())? {
                images.insert(name);
            }
        }
        tx.execute("DELETE FROM imports WHERE deck_id=?", [id])
            .map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM decks WHERE id=?", [id])
            .map_err(|e| e.to_string())?;
    }
    tx.execute(
        "DELETE FROM tags WHERE NOT EXISTS(SELECT 1 FROM card_tags WHERE tag_id=tags.id)",
        [],
    )
    .map_err(|e| e.to_string())?;
    for name in &images {
        tx.execute(
            "INSERT OR IGNORE INTO media_cleanup(name) VALUES(?)",
            [name],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    let images = {
        let mut st = conn
            .prepare("SELECT name FROM media_cleanup")
            .map_err(|e| e.to_string())?;
        let values = st
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        values
    };
    for name in images {
        if Path::new(&name).file_name().and_then(|s| s.to_str()) != Some(&name)
            || name.contains(':')
            || name.contains('\\')
        {
            conn.execute("DELETE FROM media_cleanup WHERE name=?", [&name])
                .map_err(|e| e.to_string())?;
            continue;
        }
        let used:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM decks WHERE cover_image=?1 UNION ALL SELECT 1 FROM cards WHERE question_image=?1 OR answer_image=?1 OR question_audio=?1 OR answer_audio=?1)",[&name],|r|r.get(0)).map_err(|e|e.to_string())?;
        if !used {
            match fs::remove_file(media.join(&name)) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(format!("Trash removed; media cleanup needs retry: {e}")),
            }
        }
        conn.execute("DELETE FROM media_cleanup WHERE name=?", [&name])
            .map_err(|e| e.to_string())?;
    }
    Ok(ids)
}
#[tauri::command]
pub fn cleanup_trash(db: State<Db>) -> Result<Vec<String>, String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    prune(&mut conn, &db.media_dir, Utc::now())
}
#[tauri::command]
pub fn permanently_remove(id: String, db: State<Db>) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    let meta: String = conn
        .query_row("SELECT metadata FROM decks WHERE id=?", [&id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let meta: serde_json::Value = serde_json::from_str(&meta).map_err(|e| e.to_string())?;
    if meta["deletedAt"].as_str().is_none() {
        return Err("Only sets already in Trash can be permanently removed".into());
    }
    prune_with_target(&mut conn, &db.media_dir, Utc::now(), Some(&id))?;
    Ok(())
}
#[tauri::command]
pub fn update_decks_details(decks: Vec<Deck>, db: State<Db>) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for deck in &decks {
        persist_details(&tx, deck)?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    prune(&mut conn, &db.media_dir, Utc::now())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;
    fn fixture(id: &str, deleted: Option<DateTime<Utc>>, image: &str) -> Deck {
        serde_json::from_value(serde_json::json!({"id":id,"title":id,"subject":"Test","color":"#fff","favorite":false,"coverImage":image,"meta":{"deletedAt":deleted.map(|d|d.to_rfc3339()),"folder":"Folder"},"cards":[{"id":format!("{id}-card"),"question":"Term","answer":"Answer","status":"New","accuracy":0.0,"dueAt":"2026-09-01T00:00:00Z","intervalDays":0.0,"ease":2.5,"repetitions":0,"lapses":0}]})).unwrap()
    }
    #[test]
    fn trash_capacity_and_expiry_persist_and_remove_only_unshared_media() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("test.db");
        let media = dir.path().join("media");
        fs::create_dir(&media).unwrap();
        let mut conn = open_db(&path).unwrap();
        let now = Utc::now();
        for i in 0..6 {
            let image = format!("{i}.png");
            fs::write(media.join(&image), b"fixture").unwrap();
            persist_deck(
                &mut conn,
                &fixture(&i.to_string(), Some(now - Duration::minutes(i)), &image),
                Some("import"),
            )
            .unwrap();
        }
        persist_deck(&mut conn, &fixture("active", None, "5.png"), None).unwrap();
        assert_eq!(prune(&mut conn, &media, now).unwrap(), vec!["5"]);
        assert!(media.join("5.png").exists());
        assert_eq!(
            conn.query_row("SELECT count(*) FROM cards WHERE deck_id='5'", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            conn.query_row(
                "SELECT count(*) FROM imports WHERE deck_id IS NULL",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
        drop(conn);
        let mut conn = open_db(&path).unwrap();
        assert!(prune(&mut conn, &media, now).unwrap().is_empty());
        assert_eq!(
            prune(&mut conn, &media, now + Duration::days(7))
                .unwrap()
                .len(),
            5
        );
        assert!(!media.join("0.png").exists());
        assert!(media.join("5.png").exists());
        assert_eq!(
            conn.query_row("SELECT count(*) FROM decks", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert!(conn
            .prepare("PRAGMA foreign_key_check")
            .unwrap()
            .query([])
            .unwrap()
            .next()
            .unwrap()
            .is_none());
    }
    #[test]
    fn trash_expiry_boundary_retired_media_and_retry_queue() {
        let dir = tempdir().unwrap();
        let mut conn = open_db(&dir.path().join("test.db")).unwrap();
        let now = Utc::now();
        let mut deck = fixture("old", Some(now - Duration::days(7)), "original.png");
        fs::write(dir.path().join("original.png"), b"original").unwrap();
        persist_deck(&mut conn, &deck, None).unwrap();
        deck.cover_image = Some("current.png".into());
        fs::write(dir.path().join("current.png"), b"current").unwrap();
        persist_deck(&mut conn, &deck, None).unwrap();
        assert!(
            prune(&mut conn, dir.path(), now - Duration::milliseconds(1))
                .unwrap()
                .is_empty()
        );
        assert_eq!(prune(&mut conn, dir.path(), now).unwrap(), vec!["old"]);
        assert!(!dir.path().join("original.png").exists());
        assert!(!dir.path().join("current.png").exists());
        conn.execute("INSERT INTO media_cleanup VALUES('../test.db')", [])
            .unwrap();
        conn.execute("INSERT INTO media_cleanup VALUES('leftover.png')", [])
            .unwrap();
        fs::write(dir.path().join("leftover.png"), b"retry").unwrap();
        prune(&mut conn, dir.path(), now).unwrap();
        assert!(dir.path().join("test.db").exists());
        assert!(!dir.path().join("leftover.png").exists());
        assert_eq!(
            conn.query_row("SELECT count(*) FROM media_cleanup", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
    #[test]
    fn explicit_permanent_removal_keeps_other_unexpired_trash() {
        let dir = tempdir().unwrap();
        let mut conn = open_db(&dir.path().join("trash.db")).unwrap();
        let now = Utc::now();
        persist_deck(
            &mut conn,
            &fixture("one", Some(now), "flint:preset/ember"),
            None,
        )
        .unwrap();
        persist_deck(
            &mut conn,
            &fixture("two", Some(now), "flint:preset/ember"),
            None,
        )
        .unwrap();
        assert_eq!(
            prune_with_target(&mut conn, dir.path(), now, Some("one")).unwrap(),
            vec!["one"]
        );
        assert_eq!(
            conn.query_row("SELECT id FROM decks", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "two"
        );
    }
    #[test]
    fn reordering_and_folder_metadata_preserve_card_history_after_reopen() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("test.db");
        let mut conn = open_db(&path).unwrap();
        let mut deck = fixture("order", None, "flint:preset/ember");
        let mut second = deck.cards[0].clone();
        second.id = "second".into();
        deck.cards.push(second);
        persist_deck(&mut conn, &deck, None).unwrap();
        conn.execute(
            "INSERT INTO reviews VALUES('review','order-card','2026-01-01','Good',1,100,'Answer')",
            [],
        )
        .unwrap();
        deck.cards.reverse();
        deck.meta["folder"] = "Renamed".into();
        persist_deck(&mut conn, &deck, None).unwrap();
        drop(conn);
        let conn = open_db(&path).unwrap();
        let ids = conn
            .prepare("SELECT id FROM cards ORDER BY position")
            .unwrap()
            .query_map([], |r| r.get::<_, String>(0))
            .unwrap()
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(ids, vec!["second", "order-card"]);
        assert_eq!(
            conn.query_row("SELECT count(*) FROM reviews", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
}
