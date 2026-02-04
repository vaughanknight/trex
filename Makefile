.PHONY: all build-web build-frontend build-backend build-electron clean dev-backend dev-frontend

# Read version from version.json
VERSION := $(shell cat version.json | grep version | sed 's/.*: "\(.*\)".*/\1/')

# Build the complete web binary (frontend + backend)
all: build-web

# Build frontend assets
build-frontend:
	cd frontend && npm ci && npm run build

# Copy frontend dist to backend for embedding
copy-frontend: build-frontend
	rm -rf backend/internal/static/dist
	cp -r frontend/dist backend/internal/static/dist

# Build backend binary with embedded frontend
build-backend: copy-frontend
	cd backend && go build -ldflags "-X main.Version=$(VERSION)" -o ../dist/trex ./cmd/trex

# Build complete web binary
build-web: build-backend

# Clean build artifacts
clean:
	rm -rf dist/
	rm -rf frontend/dist/
	rm -rf backend/internal/static/dist/
	rm -rf frontend/node_modules/

# Build Electron app (requires build-web first)
build-electron: build-web
	cd electron && npm ci && npm run build && npm run dist

# Development: run backend only (for testing API)
dev-backend:
	cd backend && go run -ldflags "-X main.Version=$(VERSION)" ./cmd/trex

# Development: run frontend dev server (with proxy to backend)
dev-frontend:
	cd frontend && npm run dev
