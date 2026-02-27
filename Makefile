# ============================================
# 🗄️ SQLite Explorer — Build Makefile
# ============================================
# Usage (Windows):
#   nmake          — full build
#   nmake compile  — compile only
#   nmake package  — build .vsix
#   nmake icon     — generate icon
#   nmake clean    — clean dist and vsix
#   nmake install  — install dependencies
#   nmake dev      — start watch mode
#   nmake all      — install + icon + compile + package
# ============================================

# Variables
NPM = npm
NODE = node
VSCE = npx vsce
ESBUILD = npx esbuild
DIST_DIR = dist
VSIX_FILE = sqlite-explorer-1.0.0.vsix
WASM_SRC = node_modules\sql.js\dist\sql-wasm.wasm
WASM_DST = $(DIST_DIR)\sql-wasm.wasm

# === Targets ===

# Default: full build
all: install icon compile package
	@echo ""
	@echo ========================================
	@echo  DONE! $(VSIX_FILE) built successfully
	@echo ========================================

# Install dependencies
install:
	@echo [1/4] Installing dependencies...
	$(NPM) install

# Generate icon
icon:
	@echo [2/4] Generating icon...
	$(NODE) generate-icon.js

# Compile TypeScript + copy WASM
compile:
	@echo [3/4] Compiling...
	@if not exist $(DIST_DIR) mkdir $(DIST_DIR)
	$(ESBUILD) src/extension.ts --bundle --outfile=$(DIST_DIR)/extension.js --external:vscode --format=cjs --platform=node --sourcemap
	@echo Copying sql-wasm.wasm...
	@copy /Y "$(WASM_SRC)" "$(WASM_DST)" >nul

# Build .vsix package
package:
	@echo [4/4] Building .vsix...
	$(VSCE) package --allow-missing-repository

# Watch mode for development
dev:
	@echo Starting watch mode...
	$(ESBUILD) src/extension.ts --bundle --outfile=$(DIST_DIR)/extension.js --external:vscode --format=cjs --platform=node --sourcemap --watch

# Clean
clean:
	@echo Cleaning...
	@if exist $(DIST_DIR) rmdir /s /q $(DIST_DIR)
	@if exist $(VSIX_FILE) del /q $(VSIX_FILE)
	@echo Done.

# Full rebuild from scratch
rebuild: clean all

# Quick rebuild (without npm install)
quick: icon compile package
	@echo ""
	@echo ========================================
	@echo  QUICK BUILD COMPLETE!
	@echo ========================================

.PHONY: all install icon compile package dev clean rebuild quick
