use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{any, get},
    Router,
};
use chrono::Utc;
use serde::Deserialize;
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tower_http::{cors::CorsLayer, limit::RequestBodyLimitLayer, trace::TraceLayer};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    upstream: String,
    strict_acl: bool,
    http: reqwest::Client,
    login_hits: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcEnvelope {
    method: Option<String>,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("epiton_gateway=info,tower_http=info")
        .init();

    let upstream =
        std::env::var("EPITON_UPSTREAM").unwrap_or_else(|_| "http://127.0.0.1:8000".into());
    let strict_acl = std::env::var("EPITON_STRICT_ACL")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let bind = std::env::var("EPITON_GATEWAY_BIND").unwrap_or_else(|_| "0.0.0.0:8080".into());

    let state = AppState {
        upstream,
        strict_acl,
        http: reqwest::Client::new(),
        login_hits: Arc::new(Mutex::new(HashMap::new())),
    };

    let app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/{db}/", any(proxy_rpc_root))
        .route("/{db}/rpc/", any(proxy_rpc))
        .route("/{db}/bus", any(proxy_bus))
        .layer(TraceLayer::new_for_http())
        .layer(RequestBodyLimitLayer::new(2 * 1024 * 1024))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr: SocketAddr = bind.parse().expect("invalid bind address");
    tracing::info!(%addr, "epiton-gateway listening");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(listener, app).await.expect("serve");
}

async fn proxy_rpc_root(
    State(state): State<AppState>,
    Path(db): Path<String>,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    proxy_rpc_inner(state, db, method, headers, body, false).await
}

async fn proxy_rpc(
    State(state): State<AppState>,
    Path(db): Path<String>,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    proxy_rpc_inner(state, db, method, headers, body, true).await
}

async fn proxy_rpc_inner(
    state: AppState,
    db: String,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
    use_rpc_suffix: bool,
) -> Response {
    let correlation = headers
        .get("x-correlation-id")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let rpc_method = serde_json::from_slice::<JsonRpcEnvelope>(&body)
        .ok()
        .and_then(|e| e.method);

    if rpc_method.as_deref() == Some("common.db.login") {
        if !rate_limit(&state, &client_ip(&headers)) {
            return (StatusCode::TOO_MANY_REQUESTS, "login rate limited").into_response();
        }
    }

    if state.strict_acl {
        if let Some(m) = rpc_method.as_deref() {
            if m.starts_with("model.") && m.ends_with(".create") {
                tracing::warn!(%correlation, %m, "strict mode notes create; enforce via trytond ACLs + future model-access probe");
            }
        }
    }

    let url = if use_rpc_suffix {
        format!("{}/{}/rpc/", state.upstream.trim_end_matches('/'), db)
    } else {
        format!("{}/{}/", state.upstream.trim_end_matches('/'), db)
    };
    match forward(&state, method, &url, headers, body, &correlation, rpc_method.as_deref()).await {
        Ok(resp) => resp,
        Err(err) => {
            tracing::error!(%correlation, error=%err, "upstream error");
            (StatusCode::BAD_GATEWAY, "upstream error").into_response()
        }
    }
}

async fn proxy_bus(
    State(state): State<AppState>,
    Path(db): Path<String>,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    let correlation = Uuid::new_v4().to_string();
    let url = format!("{}/{}/bus", state.upstream.trim_end_matches('/'), db);
    match forward(&state, method, &url, headers, body, &correlation, Some("bus")).await {
        Ok(resp) => resp,
        Err(_) => (StatusCode::BAD_GATEWAY, "upstream error").into_response(),
    }
}

async fn forward(
    state: &AppState,
    method: Method,
    url: &str,
    headers: HeaderMap,
    body: Bytes,
    correlation: &str,
    rpc_method: Option<&str>,
) -> Result<Response, reqwest::Error> {
    let mut req = state.http.request(method.clone(), url);
    if let Some(auth) = headers.get(axum::http::header::AUTHORIZATION) {
        req = req.header(axum::http::header::AUTHORIZATION, auth);
    }
    req = req
        .header("content-type", "application/json")
        .header("x-correlation-id", correlation)
        .body(body.to_vec());

    let started = Instant::now();
    let upstream = req.send().await?;
    let status = StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let bytes = upstream.bytes().await?;

    tracing::info!(
        %correlation,
        method = %method,
        rpc = rpc_method.unwrap_or("-"),
        %status,
        latency_ms = started.elapsed().as_millis() as u64,
        ts = %Utc::now().to_rfc3339(),
        "rpc_audit"
    );

    let mut response = Response::new(bytes.into());
    *response.status_mut() = status;
    response.headers_mut().insert(
        "x-correlation-id",
        HeaderValue::from_str(correlation).unwrap_or(HeaderValue::from_static("invalid")),
    );
    Ok(response)
}

fn client_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.split(',').next().unwrap_or("unknown").trim().to_string())
        .unwrap_or_else(|| "unknown".into())
}

fn rate_limit(state: &AppState, ip: &str) -> bool {
    let mut map = state.login_hits.lock().expect("lock");
    let now = Instant::now();
    let window = Duration::from_secs(60);
    let entry = map.entry(ip.to_string()).or_default();
    entry.retain(|t| now.duration_since(*t) < window);
    if entry.len() >= 20 {
        return false;
    }
    entry.push(now);
    true
}
