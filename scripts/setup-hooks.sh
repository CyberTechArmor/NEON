#!/usr/bin/env bash
#
# Setup Git Hooks for NEON development
#
# This enables pre-commit validation to catch common Docker configuration issues
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "Setting up Git hooks for NEON..."
echo ""

# Configure git to use .githooks directory
git config core.hooksPath .githooks

echo "Git hooks enabled!"
echo ""
echo "The following hooks are now active:"
echo "  - pre-commit: Validates Docker configuration before commits"
echo ""
echo "To disable hooks: git config --unset core.hooksPath"
echo ""
