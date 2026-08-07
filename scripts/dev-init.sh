#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STEP=1
TOTAL=7

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step() {
    echo -e "${YELLOW}[${STEP}/${TOTAL}]${NC} $1"
    STEP=$((STEP + 1))
}

check_prereqs() {
    step "Checking prerequisites..."

    if ! command -v node &> /dev/null; then
        echo -e "${RED}[ERROR] node is not installed. Install Node.js 22.13 or later.${NC}"
        exit 1
    fi
    NODE_MAJOR=$(node --version | sed 's/v//' | cut -d. -f1)
    NODE_MINOR=$(node --version | sed 's/v//' | cut -d. -f2)
    if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 13 ]; }; then
        echo -e "${RED}[ERROR] Node.js 22.13 or later required (pnpm 11 needs it). Found: $(node --version)${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✔${NC} node $(node --version)"

    if ! command -v corepack &> /dev/null; then
        echo -e "${RED}[ERROR] corepack is not available. Install Node.js 22.13 or later.${NC}"
        exit 1
    fi

    local pnpm_ver
    pnpm_ver=$(pnpm --version 2>/dev/null) || {
        echo -e "${RED}[ERROR] pnpm is not working via corepack. Enable it with: corepack enable pnpm@11.8.0${NC}"
        exit 1
    }
    echo -e "  ${GREEN}✔${NC} pnpm $pnpm_ver"

    if ! command -v docker &> /dev/null; then
        echo -e "${RED}[ERROR] docker is not installed. Install Docker first.${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✔${NC} docker $(docker --version | sed 's/Docker version //')"

    if ! docker compose version &> /dev/null; then
        echo -e "${RED}[ERROR] docker compose is not available. Install Docker Compose.${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✔${NC} $(docker compose version)"

    echo ""
}

setup_env_files() {
    step "Setting up environment files..."

    cd "$ROOT_DIR"

    if [ ! -f .env ]; then
        cp .env.example .env
        echo -e "  ${GREEN}✔${NC} Created .env from .env.example"
    else
        echo -e "  ${GREEN}✔${NC} .env already exists, skipping"
    fi

    echo ""
}

install_project_deps() {
    local name="$1"
    local dir="$2"
    echo "  Installing ${name} dependencies..."
    (cd "$dir" && pnpm install --frozen-lockfile)
    echo -e "  ${GREEN}✔${NC} ${name} dependencies installed"
}

install_hooks() {
    step "Installing git hooks..."

    git config core.hooksPath "$ROOT_DIR/scripts/hooks"
    echo -e "  ${GREEN}✔${NC} hooks activated (core.hooksPath = scripts/hooks/)"

    echo ""
}

# ─── Main ───────────────────────────────────────────────────────

check_prereqs
setup_env_files

step "Installing backend dependencies..."
install_project_deps "backend" "$ROOT_DIR/backend"

step "Installing frontend dependencies..."
install_project_deps "frontend" "$ROOT_DIR/frontend"

step "Installing test dependencies..."
install_project_deps "tests/jest" "$ROOT_DIR/tests/jest"

step "Installing database dependencies..."
install_project_deps "database" "$ROOT_DIR/database/init"

install_hooks

echo ""
echo -e "${GREEN}✔ All done! Propheta dev environment is ready.${NC}"
echo ""
echo -e "${CYAN}Quick start:${NC}"
echo "  docker compose up --build"
echo "  pnpm --prefix frontend run dev"
echo "  tests/jest/run.sh"
echo ""
