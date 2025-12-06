#!/bin/sh
# NEON Web Client Docker Entrypoint
# Substitutes environment variables at runtime

set -e

# Directory containing the built files
HTML_DIR="/usr/share/nginx/html"

# Create runtime config file with environment variables
# This allows runtime configuration without rebuilding
cat > "$HTML_DIR/config.js" << EOF
window.__NEON_CONFIG__ = {
  apiUrl: "${VITE_API_URL:-}",
  wsUrl: "${VITE_WS_URL:-}",
  livekitUrl: "${VITE_LIVEKIT_URL:-}",
  appName: "${VITE_APP_NAME:-NEON}"
};
EOF

echo "Runtime configuration created:"
cat "$HTML_DIR/config.js"

# Execute the CMD
exec "$@"
