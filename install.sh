#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
MAGENTA='\033[0;35m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${MAGENTA}"
echo "      ██╗"
echo "     ██╔╝    ${NC}${BOLD}saj${NC}${MAGENTA}"
echo "    ██╔╝     ${NC}${DIM}self-programming agent${NC}${MAGENTA}"
echo "   ██╔╝"
echo "  ███╔╝"
echo " ██╔██╗"
echo "██╔╝ ██╗"
echo "╚═╝  ╚═╝"
echo -e "${NC}"

# Check for Deno
if ! command -v deno &> /dev/null; then
    echo -e "${YELLOW}Deno not found. Installing...${NC}"
    curl -fsSL https://deno.land/install.sh | sh

    # Add to PATH for this session
    export DENO_INSTALL="$HOME/.deno"
    export PATH="$DENO_INSTALL/bin:$PATH"

    echo -e "${GREEN}✓ Deno installed${NC}"
fi

echo -e "${DIM}Installing saj...${NC}"

# Install saj globally using deno install
deno install \
    --global \
    --allow-all \
    --unstable-kv \
    --name saj \
    --force \
    https://raw.githubusercontent.com/anthropics/saj/main/saj.ts 2>/dev/null || \
deno install \
    --global \
    --allow-all \
    --unstable-kv \
    --name saj \
    --force \
    https://raw.githubusercontent.com/rahulyal/saj/main/saj.ts

echo -e "${GREEN}✓ saj installed${NC}"

# Create config directory
mkdir -p "$HOME/.saj"

# Check if saj is in PATH
if command -v saj &> /dev/null; then
    echo -e "${GREEN}✓ Ready to use${NC}"
    echo ""
    echo -e "  ${BOLD}Get started:${NC}"
    echo -e "    ${DIM}saj login${NC}      # Authenticate with GitHub"
    echo -e "    ${DIM}saj${NC}            # Start chatting"
    echo ""
else
    echo -e "${YELLOW}Add Deno to your PATH:${NC}"
    echo ""
    echo -e "  ${DIM}export PATH=\"\$HOME/.deno/bin:\$PATH\"${NC}"
    echo ""
    echo "Then run: saj login"
fi
