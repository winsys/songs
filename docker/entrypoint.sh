#!/bin/sh
set -e

# Upload dirs are git-ignored and may be absent on a fresh clone — create them
# so PHP can write uploads immediately.
for d in images images/placeholders tech_media sermon_images sermon_videos sermon_slides; do
    mkdir -p "/var/www/html/public/$d"
done

# Workerman WebSocket server: browsers reach it through the Apache /ws proxy,
# PHP pushes broadcasts via tcp://127.0.0.1:2346 (same container, so the
# hardcoded 127.0.0.1 addresses in the code work unchanged).
# Keep it in a restart loop so a crash never leaves displays without updates.
(
    while true; do
        php /var/www/html/websocket-server.php start || true
        echo "websocket-server exited; restarting in 2s" >&2
        sleep 2
    done
) &

exec apache2-foreground
