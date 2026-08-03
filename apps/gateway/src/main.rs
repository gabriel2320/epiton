mod strict;

use axum::{
    body::Bytes,
    extract::{ConnectInfo, Path, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware,
    response::{IntoResponse, Response},
    routing::{get, post},
    Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    fmt,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    limit::RequestBodyLimitLayer,
    trace::TraceLayer,
};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    upstream: String,
    strict_acl: bool,
    /// When true, trust X-Forwarded-For for rate-limit keys (only behind a known reverse proxy).
    trust_proxy: bool,
    http: reqwest::Client,
    login_hits: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
    login_limit: usize,
    response_limit: usize,
}

#[derive(Debug)]
enum ForwardError {
    Upstream(reqwest::Error),
    InvalidJson(serde_json::Error),
    ResponseTooLarge { limit: usize },
}

impl ForwardError {
    fn is_timeout(&self) -> bool {
        matches!(self, Self::Upstream(error) if error.is_timeout())
    }

    fn is_response_too_large(&self) -> bool {
        matches!(self, Self::ResponseTooLarge { .. })
    }
}

impl fmt::Display for ForwardError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Upstream(error) => write!(formatter, "{error}"),
            Self::InvalidJson(error) => write!(formatter, "invalid upstream JSON: {error}"),
            Self::ResponseTooLarge { limit } => {
                write!(formatter, "upstream response exceeds {limit} bytes")
            }
        }
    }
}

impl std::error::Error for ForwardError {}

impl From<reqwest::Error> for ForwardError {
    fn from(error: reqwest::Error) -> Self {
        Self::Upstream(error)
    }
}

impl From<serde_json::Error> for ForwardError {
    fn from(error: serde_json::Error) -> Self {
        Self::InvalidJson(error)
    }
}

#[derive(Debug, Deserialize)]
struct JsonRpcEnvelope {
    method: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("epiton_gateway=info,tower_http=info")
        // Gateway audit output is a machine-processed production artifact.
        // ANSI escapes make fields such as `status=200` ambiguous once Docker
        // redirects the stream to a file and break correlation reconciliation.
        .with_ansi(false)
        .init();

    let upstream = validated_upstream(
        &std::env::var("EPITON_UPSTREAM").unwrap_or_else(|_| "http://127.0.0.1:8000".into()),
    )
    .expect("invalid EPITON_UPSTREAM");
    // trytond remains the authorization authority. This optional compatibility
    // guard is deliberately opt-in because it must never grant access itself.
    let strict_acl = env_flag("EPITON_STRICT_ACL", false);
    let trust_proxy = env_flag("EPITON_TRUST_PROXY", false);
    let bind = std::env::var("EPITON_GATEWAY_BIND").unwrap_or_else(|_| "0.0.0.0:8080".into());
    let cors_origins =
        parse_cors_origins(&std::env::var("EPITON_CORS_ORIGINS").unwrap_or_default())
            .expect("invalid EPITON_CORS_ORIGINS");
    let body_limit = env_usize("EPITON_MAX_BODY_BYTES", 16 * 1024 * 1024);
    let response_limit = env_usize("EPITON_MAX_RESPONSE_BYTES", 64 * 1024 * 1024);
    let login_limit = env_usize("EPITON_LOGIN_LIMIT_PER_MINUTE", 20);
    let timeout = Duration::from_secs(env_usize("EPITON_UPSTREAM_TIMEOUT_SECS", 120) as u64);
    let http = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(5))
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("build HTTP client");

    let state = AppState {
        upstream,
        strict_acl,
        trust_proxy,
        http,
        login_hits: Arc::new(Mutex::new(HashMap::new())),
        login_limit,
        response_limit,
    };

    let mut app = Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/{db}/", post(proxy_rpc_root))
        .route("/{db}/rpc/", post(proxy_rpc))
        .route("/{db}/bus", post(proxy_bus))
        .layer(TraceLayer::new_for_http())
        .layer(RequestBodyLimitLayer::new(body_limit))
        .layer(middleware::map_response(security_headers))
        .with_state(state);
    if !cors_origins.is_empty() {
        app = app.layer(build_cors_layer(cors_origins));
    }

    let addr: SocketAddr = bind.parse().expect("invalid bind address");
    tracing::info!(%addr, "epiton-gateway listening");
    let listener = tokio::net::TcpListener::bind(addr).await.expect("bind");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
    .expect("serve");
}

fn env_flag(name: &str, default: bool) -> bool {
    match std::env::var(name) {
        Ok(v) => v == "1" || v.eq_ignore_ascii_case("true"),
        Err(_) => default,
    }
}

fn env_usize(name: &str, default: usize) -> usize {
    std::env::var(name)
        .ok()
        .and_then(|value| value.parse::<usize>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(default)
}

fn validated_upstream(raw: &str) -> Result<String, String> {
    let parsed = reqwest::Url::parse(raw).map_err(|err| err.to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("upstream must use http or https".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("upstream URL must not contain credentials".into());
    }
    if parsed.query().is_some() || parsed.fragment().is_some() {
        return Err("upstream URL must not contain query or fragment".into());
    }
    Ok(raw.trim_end_matches('/').to_string())
}

/// Parse explicit browser origins. Empty means same-origin only (no CORS headers).
fn parse_cors_origins(raw: &str) -> Result<Vec<HeaderValue>, String> {
    raw.split(',')
        .map(str::trim)
        .filter(|origin| !origin.is_empty())
        .map(|origin| {
            if origin == "*" {
                return Err("wildcard origin is forbidden".into());
            }
            let url =
                reqwest::Url::parse(origin).map_err(|_| format!("invalid origin: {origin}"))?;
            if !matches!(url.scheme(), "http" | "https")
                || url.host().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
                || url.path() != "/"
                || url.query().is_some()
                || url.fragment().is_some()
            {
                return Err(format!(
                    "origin must contain only scheme and authority: {origin}"
                ));
            }
            HeaderValue::from_str(origin).map_err(|_| format!("invalid origin header: {origin}"))
        })
        .collect()
}

fn build_cors_layer(origins: Vec<HeaderValue>) -> CorsLayer {
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods([Method::POST, Method::OPTIONS])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::HeaderName::from_static("x-correlation-id"),
        ])
}

async fn security_headers(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(
        header::HeaderName::from_static("permissions-policy"),
        HeaderValue::from_static("camera=(), microphone=(), geolocation=(), payment=()"),
    );
    response
}

async fn proxy_rpc_root(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Path(db): Path<String>,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    proxy_rpc_inner(state, peer, db, method, headers, body, false).await
}

async fn proxy_rpc(
    State(state): State<AppState>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Path(db): Path<String>,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    proxy_rpc_inner(state, peer, db, method, headers, body, true).await
}

async fn proxy_rpc_inner(
    state: AppState,
    peer: SocketAddr,
    db: String,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
    use_rpc_suffix: bool,
) -> Response {
    if !valid_database_name(&db) {
        return (StatusCode::BAD_REQUEST, "invalid database name").into_response();
    }
    if !is_json_request(&headers) {
        return (
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "application/json required",
        )
            .into_response();
    }
    let correlation = headers
        .get("x-correlation-id")
        .and_then(|v| v.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .map(|value| value.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let rpc_method = match serde_json::from_slice::<JsonRpcEnvelope>(&body) {
        Ok(envelope) if !envelope.method.is_empty() && envelope.method.len() <= 200 => {
            envelope.method
        }
        _ => return (StatusCode::BAD_REQUEST, "invalid JSON-RPC envelope").into_response(),
    };

    if rpc_method == "common.db.login" {
        if !rate_limit(&state, &client_ip(&state, &headers, peer)) {
            return (StatusCode::TOO_MANY_REQUESTS, "login rate limited").into_response();
        }
    }

    if state.strict_acl {
        if let Some((model, method_name)) = strict::parse_model_method(&rpc_method) {
            if strict::is_mutating_method(method_name) {
                let url = if use_rpc_suffix {
                    format!("{}/{}/rpc/", state.upstream.trim_end_matches('/'), db)
                } else {
                    format!("{}/{}/", state.upstream.trim_end_matches('/'), db)
                };
                match probe_model_access(&state, &url, &headers, model, &correlation).await {
                    Ok(true) => {}
                    Ok(false) => {
                        tracing::warn!(%correlation, %model, %method_name, "strict ACL deny");
                        return (
                            StatusCode::FORBIDDEN,
                            format!("Epiton strict ACL: model {model} has no access metadata"),
                        )
                            .into_response();
                    }
                    Err(err) => {
                        tracing::error!(%correlation, error=%err, "strict ACL probe failed");
                        return (StatusCode::BAD_GATEWAY, "strict ACL probe failed")
                            .into_response();
                    }
                }
            }
        }
    }

    let url = if use_rpc_suffix {
        format!("{}/{}/rpc/", state.upstream.trim_end_matches('/'), db)
    } else {
        format!("{}/{}/", state.upstream.trim_end_matches('/'), db)
    };
    match forward(
        &state,
        method,
        &url,
        headers,
        body,
        &correlation,
        Some(&rpc_method),
    )
    .await
    {
        Ok(resp) => resp,
        Err(err) => {
            tracing::error!(%correlation, error=%err, "upstream error");
            if err.is_response_too_large() {
                (StatusCode::BAD_GATEWAY, "upstream response too large").into_response()
            } else if err.is_timeout() {
                (StatusCode::GATEWAY_TIMEOUT, "upstream timeout").into_response()
            } else {
                (StatusCode::BAD_GATEWAY, "upstream error").into_response()
            }
        }
    }
}

async fn probe_model_access(
    state: &AppState,
    url: &str,
    headers: &HeaderMap,
    model: &str,
    correlation: &str,
) -> Result<bool, ForwardError> {
    let body = json!({
        "id": 1,
        "method": "model.ir.model.access.search_read",
        "params": [[["model.model", "=", model]], 0, 1, null, ["id"], {}]
    });
    let mut req = state.http.post(url).json(&body);
    if let Some(auth) = headers.get(axum::http::header::AUTHORIZATION) {
        req = req.header(axum::http::header::AUTHORIZATION, auth.clone());
    }
    req = req.header("x-correlation-id", correlation);
    let resp = req.send().await?;
    let bytes = read_upstream_body(resp, state.response_limit.min(1024 * 1024)).await?;
    let payload: Value = serde_json::from_slice(&bytes)?;
    if let Some(result) = payload.get("result") {
        return Ok(strict::access_rows_present(result));
    }
    // If probe itself errors (auth, missing model), fail closed in strict mode.
    Ok(false)
}

async fn proxy_bus(
    State(state): State<AppState>,
    Path(db): Path<String>,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !valid_database_name(&db) {
        return (StatusCode::BAD_REQUEST, "invalid database name").into_response();
    }
    if !is_json_request(&headers) {
        return (
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "application/json required",
        )
            .into_response();
    }
    let correlation = headers
        .get("x-correlation-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .map(|value| value.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let url = format!("{}/{}/bus", state.upstream.trim_end_matches('/'), db);
    match forward(
        &state,
        method,
        &url,
        headers,
        body,
        &correlation,
        Some("bus"),
    )
    .await
    {
        Ok(resp) => resp,
        Err(err) if err.is_response_too_large() => {
            (StatusCode::BAD_GATEWAY, "upstream response too large").into_response()
        }
        Err(err) if err.is_timeout() => {
            (StatusCode::GATEWAY_TIMEOUT, "upstream timeout").into_response()
        }
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
) -> Result<Response, ForwardError> {
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
    let status =
        StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let content_type = upstream.headers().get(header::CONTENT_TYPE).cloned();
    let bytes = read_upstream_body(upstream, state.response_limit).await?;

    tracing::info!(
        %correlation,
        method = %method,
        rpc = %rpc_method.unwrap_or("-"),
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
    if let Some(content_type) = content_type {
        response
            .headers_mut()
            .insert(header::CONTENT_TYPE, content_type);
    }
    Ok(response)
}

async fn read_upstream_body(
    mut response: reqwest::Response,
    limit: usize,
) -> Result<Vec<u8>, ForwardError> {
    if response
        .content_length()
        .is_some_and(|length| length > limit as u64)
    {
        return Err(ForwardError::ResponseTooLarge { limit });
    }

    let capacity = response
        .content_length()
        .and_then(|length| usize::try_from(length).ok())
        .unwrap_or_default()
        .min(limit);
    let mut body = Vec::with_capacity(capacity);
    while let Some(chunk) = response.chunk().await? {
        append_response_chunk(&mut body, &chunk, limit)?;
    }
    Ok(body)
}

fn append_response_chunk(
    body: &mut Vec<u8>,
    chunk: &[u8],
    limit: usize,
) -> Result<(), ForwardError> {
    if chunk.len() > limit.saturating_sub(body.len()) {
        return Err(ForwardError::ResponseTooLarge { limit });
    }
    body.extend_from_slice(chunk);
    Ok(())
}

fn valid_database_name(db: &str) -> bool {
    !db.is_empty()
        && db.len() <= 63
        && !matches!(db, "." | "..")
        && db
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'.'))
}

fn is_json_request(headers: &HeaderMap) -> bool {
    headers
        .get(header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|mime| mime.trim().eq_ignore_ascii_case("application/json"))
}

fn client_ip(state: &AppState, headers: &HeaderMap, peer: SocketAddr) -> String {
    if state.trust_proxy {
        if let Some(xff) = headers
            .get("x-forwarded-for")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.split(',').next())
            .map(str::trim)
            .filter(|candidate| candidate.parse::<std::net::IpAddr>().is_ok())
            .map(str::to_string)
        {
            return xff;
        }
    }
    peer.ip().to_string()
}

fn rate_limit(state: &AppState, ip: &str) -> bool {
    let mut map = state.login_hits.lock().expect("lock");
    let now = Instant::now();
    let window = Duration::from_secs(60);
    for hits in map.values_mut() {
        hits.retain(|t| now.duration_since(*t) < window);
    }
    map.retain(|_, hits| !hits.is_empty());
    let entry = map.entry(ip.to_string()).or_default();
    if entry.len() >= state.login_limit {
        return false;
    }
    entry.push(now);
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rate_limit_allows_under_threshold() {
        let state = AppState {
            upstream: "http://127.0.0.1:8000".into(),
            strict_acl: false,
            trust_proxy: false,
            http: reqwest::Client::new(),
            login_hits: Arc::new(Mutex::new(HashMap::new())),
            login_limit: 20,
            response_limit: 64 * 1024 * 1024,
        };
        for _ in 0..5 {
            assert!(rate_limit(&state, "127.0.0.1"));
        }
    }

    #[test]
    fn validates_database_segments() {
        assert!(valid_database_name("gnuhealth_demo-8.0"));
        assert!(!valid_database_name("../secret"));
        assert!(!valid_database_name("bad/name"));
        assert!(!valid_database_name(".."));
        assert!(!valid_database_name(""));
    }

    #[test]
    fn cors_is_explicit_and_never_wildcard() {
        assert!(parse_cors_origins("").expect("empty is valid").is_empty());
        assert_eq!(
            parse_cors_origins("https://epiton.example.test")
                .expect("origin")
                .len(),
            1
        );
        assert!(parse_cors_origins("*").is_err());
        assert!(parse_cors_origins("https://example.test/path").is_err());
        assert!(parse_cors_origins("https://user@example.test").is_err());
    }

    #[test]
    fn upstream_rejects_credentials_and_non_http_schemes() {
        assert!(validated_upstream("http://tryton:8000").is_ok());
        assert!(validated_upstream("file:///etc/passwd").is_err());
        assert!(validated_upstream("http://admin:secret@tryton:8000").is_err());
    }

    #[test]
    fn only_json_content_type_is_accepted() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json; charset=utf-8"),
        );
        assert!(is_json_request(&headers));
        headers.insert(header::CONTENT_TYPE, HeaderValue::from_static("text/plain"));
        assert!(!is_json_request(&headers));
    }

    #[test]
    fn response_chunks_are_bounded() {
        let mut body = Vec::new();
        append_response_chunk(&mut body, b"1234", 8).expect("first chunk");
        append_response_chunk(&mut body, b"5678", 8).expect("exact limit");
        assert_eq!(body, b"12345678");

        let error = append_response_chunk(&mut body, b"9", 8).expect_err("over limit");
        assert!(matches!(error, ForwardError::ResponseTooLarge { limit: 8 }));
    }
}
