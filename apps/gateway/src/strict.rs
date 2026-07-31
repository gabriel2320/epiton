//! Strict ACL helpers for Epiton gateway.
use serde_json::Value;

/// Extract Tryton model name from RPC method `model.<name>.<method>`.
pub fn parse_model_method(rpc_method: &str) -> Option<(&str, &str)> {
    let rest = rpc_method.strip_prefix("model.")?;
    let (model, method) = rest.rsplit_once('.')?;
    if model.is_empty() || method.is_empty() {
        return None;
    }
    Some((model, method))
}

pub fn is_mutating_method(method: &str) -> bool {
    matches!(
        method,
        "create"
            | "write"
            | "delete"
            | "copy"
            | "import_data"
            | "export_data_domain"
            | "workflow_trigger"
    ) || method.starts_with("button_")
}

/// True when search_read of ir.model.access returned at least one row.
pub fn access_rows_present(result: &Value) -> bool {
    match result {
        Value::Array(rows) => !rows.is_empty(),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_model_methods() {
        assert_eq!(
            parse_model_method("model.party.party.create"),
            Some(("party.party", "create"))
        );
        assert_eq!(parse_model_method("common.db.login"), None);
    }

    #[test]
    fn detects_mutating() {
        assert!(is_mutating_method("write"));
        assert!(is_mutating_method("button_confirm"));
        assert!(is_mutating_method("import_data"));
        assert!(!is_mutating_method("search_read"));
    }

    #[test]
    fn access_presence() {
        assert!(access_rows_present(&json!([{ "id": 1 }])));
        assert!(!access_rows_present(&json!([])));
    }
}
