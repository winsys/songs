#!/bin/sh
set -e

if [ -z "$SONGS_LAN_IP" ]; then
    echo "SONGS_LAN_IP is empty (docker/.env) — DNS idle."
    echo "Set it to this machine's reserved LAN IP, then: docker compose up -d"
    while true; do sleep 3600; done
fi

cat > /etc/dnsmasq.conf <<EOF
port=53
no-resolv
no-hosts
local=/lan/
address=/songs.lan/$SONGS_LAN_IP
cache-size=1000
EOF

echo "dnsmasq up: songs.lan -> $SONGS_LAN_IP (other queries: REFUSED — no upstream by design)"
exec dnsmasq -k --log-facility=-
