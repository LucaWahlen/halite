# syntax=docker/dockerfile:1
FROM oven/bun:1-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
ENV VITE_OUT_DIR=/src/dist
RUN bun run build

FROM golang:1.27-alpine AS backend
WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=frontend /src/dist ./web/dist
RUN mkdir -p /out/data/uploads && chown -R 65532:65532 /out/data && \
    CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/halite ./cmd/halite

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=backend /out/halite /halite
COPY --from=backend --chown=65532:65532 /out/data /data
ENV HALITE_DB_PATH=/data/halite.db HALITE_UPLOADS_DIR=/data/uploads HALITE_ADDR=:8080
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/halite"]
