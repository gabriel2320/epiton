# syntax=docker/dockerfile:1
FROM rust:1.85-bookworm AS build
WORKDIR /src
COPY Cargo.toml ./
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/target/release/epiton-gateway /usr/local/bin/epiton-gateway
ENV EPITON_GATEWAY_BIND=0.0.0.0:8080
ENV EPITON_UPSTREAM=http://tryton:8000
EXPOSE 8080
CMD ["epiton-gateway"]
