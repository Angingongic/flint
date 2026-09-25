use serde_json::Value;
use std::collections::HashSet;

pub fn image(value: &Value) -> Option<&str> {
    (value["type"] == "occlusion")
        .then(|| value["image"].as_str())
        .flatten()
}
pub fn image_ref(value: &Value) -> Option<&String> {
    if value["type"] != "occlusion" {
        return None;
    }
    match &value["image"] {
        Value::String(name) => Some(name),
        _ => None,
    }
}
pub fn image_mut(value: &mut Value) -> Option<&mut String> {
    if value["type"] != "occlusion" {
        return None;
    }
    match value.get_mut("image") {
        Some(Value::String(name)) => Some(name),
        _ => None,
    }
}

pub fn image_refs(value: &Value) -> Vec<&String> {
    if value["type"] == "occlusion" { return image_ref(value).into_iter().collect(); }
    value.get("images").and_then(Value::as_object).into_iter().flat_map(|images| images.values()).filter_map(|image| match image {Value::String(name)=>Some(name), _=>None}).collect()
}
pub fn image_muts(value: &mut Value) -> Vec<&mut String> {
    if value["type"] == "occlusion" { return image_mut(value).into_iter().collect(); }
    value.get_mut("images").and_then(Value::as_object_mut).into_iter().flat_map(|images| images.values_mut()).filter_map(|image| match image {Value::String(name)=>Some(name), _=>None}).collect()
}
pub fn stored_images(conn:&rusqlite::Connection, deck:Option<&str>)->Result<Vec<String>,String> {
    let mut st=conn.prepare("SELECT structure_json FROM cards WHERE structure_json IS NOT NULL AND (?1 IS NULL OR deck_id=?1)").map_err(|e|e.to_string())?;
    let mut names=vec![];
    for row in st.query_map([deck],|r|r.get::<_,String>(0)).map_err(|e|e.to_string())? {
        let value:Value=serde_json::from_str(&row.map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
        names.extend(image_refs(&value).into_iter().cloned());
    }
    Ok(names)
}

/// Validate versioned knowledge before writing it to SQLite or accepting a package.
pub fn validate(value: &Value) -> Result<(), String> {
    let invalid = || "Invalid or unsupported structured card".to_string();
    if value["version"].as_u64() != Some(1)
        || value["title"].as_str().is_none_or(|s| s.len() > 4000)
    {
        return Err(invalid());
    }
    let valid_id = |v: &Value| {
        v.as_str()
            .is_some_and(|s| !s.is_empty() && s.len() <= 720 && !s.contains(':'))
    };
    match value["type"].as_str() {
        Some("occlusion") => {
            let name = image(value).ok_or_else(invalid)?;
            if name.is_empty() || name.contains(['/', '\\', ':']) || name.contains("..") {
                return Err("Structured image must be a local media reference".into());
            }
            let regions = value["regions"].as_array().ok_or_else(invalid)?;
            if regions.is_empty() || regions.len() > 200 {
                return Err(invalid());
            }
            let mut ids = HashSet::new();
            for region in regions {
                if region.get("color").is_some_and(|color| !valid_color(color)) || region.get("socket").is_some_and(|socket| !socket.as_str().is_some_and(|s| ["left","right","top","bottom"].contains(&s))) {
                    return Err(invalid());
                }
                if let Some(anchor) = region.get("anchor") {
                    for axis in ["x", "y"] {
                        if anchor[axis].as_f64().is_none_or(|n| !n.is_finite() || !(0.0..=1.0).contains(&n)) {
                            return Err(invalid());
                        }
                    }
                }
                if !valid_id(&region["id"])
                    || !ids.insert(region["id"].as_str().unwrap())
                    || region["answer"]
                        .as_str()
                        .is_none_or(|s| s.trim().is_empty() || s.len() > 40000)
                {
                    return Err(invalid());
                }
                let number = |key: &str| {
                    region[key]
                        .as_f64()
                        .filter(|n| n.is_finite())
                        .ok_or_else(invalid)
                };
                let (x, y, w, h) = (
                    number("x")?,
                    number("y")?,
                    number("width")?,
                    number("height")?,
                );
                if x < 0.0
                    || y < 0.0
                    || w < 0.015
                    || h < 0.015
                    || x + w > 1.000001
                    || y + h > 1.000001
                {
                    return Err(invalid());
                }
            }
        }
        Some("table") => {
            let rows = value["rows"].as_array().ok_or_else(invalid)?;
            let columns = value["columns"].as_array().ok_or_else(invalid)?;
            if rows.is_empty() || rows.len() > 100 || columns.is_empty() || columns.len() > 20 {
                return Err(invalid());
            }
            for axis in [rows, columns] {
                let mut ids = HashSet::new();
                for item in axis {
                    if !valid_id(&item["id"])
                        || item.get("name").is_some_and(|v| v.as_str().is_none_or(|s| s.len() > 4000))
                        || !ids.insert(item["id"].as_str().unwrap())
                        || item["size"]
                            .as_f64()
                            .is_none_or(|s| !s.is_finite() || !(24.0..=640.0).contains(&s))
                    {
                        return Err(invalid());
                    }
                }
            }
            for key in ["headerRow", "headerColumn", "gridLines"] {
                if !value[key].is_boolean() {
                    return Err(invalid());
                }
            }
            let legal: HashSet<_> = rows
                .iter()
                .flat_map(|r| {
                    columns.iter().map(move |c| {
                        format!(
                            "{}:{}",
                            r["id"].as_str().unwrap(),
                            c["id"].as_str().unwrap()
                        )
                    })
                })
                .collect();
            let cells = value["cells"].as_object().ok_or_else(invalid)?;
            if let Some(images)=value.get("images") {
                let images=images.as_object().ok_or_else(invalid)?;
                for (key,name) in images {
                    if !legal.contains(key) || name.as_str().is_none_or(|s|s.is_empty() || s.contains(['/', '\\', ':']) || s.contains("..")) {return Err(invalid());}
                }
            }
            if let Some(layouts)=value.get("imageLayouts") {
                for (key,layout) in layouts.as_object().ok_or_else(invalid)? {
                    if !legal.contains(key) || value["images"][key].as_str().is_none() {return Err(invalid());}
                    for (field,min) in [("x",0.0),("y",0.0),("width",24.0)] {
                        if layout[field].as_f64().is_none_or(|n|!n.is_finite() || n<min || n>640.0) {return Err(invalid());}
                    }
                    if let Some(crop)=layout.get("crop") {
                        for (field,min) in [("x",0.0),("y",0.0),("width",0.05),("height",0.05)] {
                            if crop[field].as_f64().is_none_or(|n|!n.is_finite() || n<min || n>1.0) {return Err(invalid());}
                        }
                        if crop["x"].as_f64().unwrap()+crop["width"].as_f64().unwrap()>1.000001 || crop["y"].as_f64().unwrap()+crop["height"].as_f64().unwrap()>1.000001 {return Err(invalid());}
                    }
                }
            }
            if let Some(positions)=value.get("textPositions") {
                for (key,position) in positions.as_object().ok_or_else(invalid)? {
                    if !legal.contains(key) {return Err(invalid());}
                    for field in ["x","y"] {
                        if position[field].as_f64().is_none_or(|n|!n.is_finite() || !(0.0..=640.0).contains(&n)) {return Err(invalid());}
                    }
                }
            }
            if cells.iter().any(|(key, text)| {
                !legal.contains(key) || text.as_str().is_none_or(|s| s.len() > 40000)
            }) || !cells
                .values()
                .any(|text| text.as_str().is_some_and(|s| !s.trim().is_empty()))
            {
                return Err(invalid());
            }
            if let Some(formats) = value.get("formats") {
                let formats = formats.as_object().ok_or_else(invalid)?;
                for (key, format) in formats {
                    if !legal.contains(key) || !valid_style(format, true) { return Err(invalid()); }
                    if let Some(runs) = format.get("runs") {
                        let runs = runs.as_array().ok_or_else(invalid)?;
                        if runs.len() > 10000 { return Err(invalid()); }
                        let length = cells.get(key).and_then(Value::as_str).unwrap_or("").encode_utf16().count() as u64;
                        let mut previous_end = 0;
                        for run in runs {
                            let start = run["start"].as_u64().ok_or_else(invalid)?;
                            let end = run["end"].as_u64().ok_or_else(invalid)?;
                            if start < previous_end || end <= start || end > length || !valid_style(&run["style"], false) { return Err(invalid()); }
                            previous_end = end;
                        }
                    }
                }
            }
        }
        _ => return Err(invalid()),
    }
    Ok(())
}

fn valid_style(value: &Value, cell: bool) -> bool {
    value.as_object().is_some_and(|style| style.iter().all(|(key, value)| match key.as_str() {
        "bold" | "italic" | "underline" | "strike" => value.is_boolean(),
        "color" => valid_color(value),
        "background" if cell => valid_color(value),
        "align" if cell => value.as_str().is_some_and(|s| ["left", "center", "right"].contains(&s)),
        "runs" if cell => true,
        _ => false,
    }))
}
fn valid_color(value: &Value) -> bool {
    value.as_str().is_some_and(|s| s.len() == 7 && s.starts_with('#') && s.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_legacy_and_independent_callout_coordinates() {
        let mut card = serde_json::json!({"version":1,"type":"occlusion","title":"","image":"original.png","regions":[{"id":"r","answer":"Nucleus","x":0.1,"y":0.2,"width":0.2,"height":0.1}]});
        assert!(validate(&card).is_ok());
        card["regions"][0]["anchor"] = serde_json::json!({"x":0.8,"y":0.7});
        card["regions"][0]["color"] = "#ff55aa".into();
        card["regions"][0]["socket"] = "bottom".into();
        assert!(validate(&card).is_ok());
        let restored: Value = serde_json::from_str(&serde_json::to_string(&card).unwrap()).unwrap();
        assert_eq!(restored, card);
        card["regions"][0]["color"] = "url(unsafe)".into();
        assert!(validate(&card).is_err());
        card["regions"][0]["color"] = "#ff55aa".into();
        for anchor in [serde_json::json!({"x":1.1,"y":0.5}), serde_json::json!({"x":0.1}), Value::Null] {
            card["regions"][0]["anchor"] = anchor;
            assert!(validate(&card).is_err());
        }
    }
    #[test]
    fn validates_persistent_cell_and_text_formatting() {
        let mut card=serde_json::json!({"version":1,"type":"table","title":"","rows":[{"id":"r","size":44}],"columns":[{"id":"c","size":160}],"headerRow":false,"headerColumn":false,"gridLines":true,"cells":{"r:c":"A😀B"},"formats":{"r:c":{"bold":true,"color":"#abcDEF","runs":[{"start":1,"end":3,"style":{"bold":false,"underline":true}}]}}});
        assert!(validate(&card).is_ok());
        card["formats"]["r:c"]["runs"][0]["end"]=5.into();assert!(validate(&card).is_err());
        card["formats"]["r:c"]=serde_json::json!({"background":"url(unsafe)"});assert!(validate(&card).is_err());
        card["formats"]=serde_json::json!({"missing":{"bold":true}});assert!(validate(&card).is_err());
    }
}
