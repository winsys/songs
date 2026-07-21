# Tiny authoritative DNS for the offline LAN: answers songs.lan with this
# machine's address and quickly refuses everything else (no upstream — there
# is no internet). Clients get it via the router's DHCP "Primary DNS".
FROM alpine:3.20
RUN apk add --no-cache dnsmasq
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
