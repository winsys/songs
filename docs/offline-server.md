# Offline server copy (Docker) — LAN deployment without internet

Runs a full copy of songs.winsys.lv on a local machine for use in an isolated
LAN (church building without internet). Created 2026-07-22.

Architecture — two containers (`docker/docker-compose.yml`, project name
`songs-offline`):

- **web** — `php:7.2-apache` (production parity: prod runs PHP 7.2.24) with
  Workerman in the SAME container. Apache serves `public/`, proxies `/ws` to
  `ws://127.0.0.1:2345` (`mod_proxy_wstunnel`) exactly like the production
  reverse proxy, so `websocket_auth.js`'s auto-detected same-origin URL and the
  hardcoded `tcp://127.0.0.1:2346` PHP-push address work unchanged. The repo is
  bind-mounted at `/var/www/html`; `docker/config.container.php` (generated,
  git-ignored) overlays `app/config.php` inside the container only.
- **db** — `mysql:5.7` (prod: 5.7.42). `docker/initdb/*.sql(.gz)` auto-imports
  once on first start with an empty volume. Host-only admin access on
  `127.0.0.1:33306`.

Only port **80** needs to be reachable from the LAN — browsers reach the
WebSocket through `/ws` on the same port; 2345/2346 never leave the container.

The image build repoints APT at `archive.debian.org` (the php:7.2 base is
Debian buster, EOL). `WITH_PPTX=1` (default) adds LibreOffice + Ghostscript for
the sermon pptx import (~785 MB image); `WITH_PPTX=0` builds small and fast,
pptx import then reports "LibreOffice missing".

## First-time setup (requires internet + ssh key to production)

```
tools\offline_sync.cmd            # or: bash tools/offline_sync.sh [all|config|db|media]
cd docker
docker compose up -d --build
```

Then open <http://localhost/> and log in with regular (non-Google) credentials.

`offline_sync` pulls from `root@server.winsys.lv`:

- **config** — generates `docker/.env` (random DB passwords) and
  `docker/config.container.php`. `encryption_key` is copied from production —
  it MUST match, or stored `enc:` passwords and WS HMAC tokens stop working.
  Secrets are captured via `ssh php -r` output; the production config file
  itself is never copied.
- **db** — `mysqldump` through the server's unix socket (the app connects with
  `host=localhost`, so the `port` value in the production config is not what
  mysqld listens on — do not "fix" the socket logic), `--no-tablespaces`
  (the app DB user lacks the PROCESS privilege mysqldump ≥ 5.7.31 wants),
  gzipped to `docker/initdb/00_production.sql.gz`.
- **media** — tar-over-ssh of `public/images` (~1.4 GB sheet music),
  `tech_media`, `sermon_images`, `sermon_videos` into the working tree.

Everything synced is git-ignored (`docker/.env`, `docker/config.container.php`,
`docker/initdb/*.sql*`, the media dirs). Production data never enters the repo.

## Updating the copy (do while online)

- **Code:** `git pull` — the bind mount makes PHP/JS changes live instantly.
  After changing `websocket-server.php`: `docker compose restart web`.
- **Fresh DB from production:** `tools\offline_sync.cmd db`, then re-import
  (wipes the container DB — back up local changes first, see below):
  `cd docker && docker compose down -v && docker compose up -d`
- **Media:** `tools\offline_sync.cmd media` (full re-download).

## LAN access and domain emulation

Recommended target: `http://songs.lan` from any device on the LAN.

1. **Server address.** Give the server machine a fixed IP — best as a DHCP
   reservation on the router (e.g. `192.168.68.10`). Avoid hardcoding a static
   IP on the machine itself if the router can reserve it.
2. **DNS name.** In order of preference:
   - **Router DNS entry** (Keenetic, MikroTik, OpenWrt, most business APs):
     add A-record `songs.lan` → server IP. Every client just works.
     The church router (TP-Link AC1200 class, stock firmware) can NOT do
     this — it has DHCP address reservation but no custom DNS records. There,
     use the bundled DNS container (see "`songs.lan` for every device" below)
     or fall back to mDNS / hosts / raw IP.
   - **hosts file** on fixed devices (tech PC, screen PCs):
     `192.168.68.10  songs.lan` in
     `C:\Windows\System32\drivers\etc\hosts` (or `/etc/hosts`).
   - **mDNS, zero config:** Windows answers for its own hostname —
     `http://zenbook-winsys.local` works from iOS, Windows and Android 12+
     without any setup. Older Android may not resolve `.local`.
   - **Raw IP** always works: `http://192.168.68.10/`.

   Do NOT reuse `songs.winsys.lv` as the internal name: devices that visited
   production may have cached the HTTP→HTTPS 301 and will refuse the plain-HTTP
   LAN copy. A distinct name (`songs.lan`) avoids that entirely.
3. **Firewall** (run once, admin PowerShell on the server machine):

   ```powershell
   New-NetFirewallRule -DisplayName "Songs offline server (HTTP 80)" `
     -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -Profile Private,Domain
   ```

   Make sure the LAN connection's network profile is **Private**
   (`Set-NetConnectionProfile -NetworkCategory Private`), otherwise the Public
   profile blocks inbound traffic regardless of the rule.
4. **Router without WAN** is fine: it only needs to do Wi-Fi + DHCP (+ DNS).
   No NTP/internet required — the app uses plain HTTP (no TLS cert clock
   checks) and WS tokens are not time-based.
5. **Client devices:** on Android, disable "switch to mobile data when Wi-Fi
   has no internet" (else phones drop off the LAN mid-service). On iOS ignore
   the "No Internet Connection" banner — the LAN still works.
6. **HTTP, not HTTPS, by design:** no internet means no Let's Encrypt;
   self-signed certs would require installing a CA on every device. Session
   cookies get the `Secure` flag only when the request actually arrives over
   HTTPS (`public/index.php` checks the scheme) — hardcoding it broke login
   over plain HTTP: browsers silently reject `Secure` cookies on http://, the
   login succeeded server-side but the session cookie never stuck (found
   2026-07-22 on the church LAN, fixed). Do not expose this copy to untrusted
   networks.
7. **Autostart:** Docker Desktop → Settings → "Start Docker Desktop when you
   sign in"; both services have `restart: unless-stopped`. Enable Windows
   auto-login if the box should recover from a power cut unattended.
8. **Moving to a different router / network:** nothing server-side depends on
   the IP — Docker binds 0.0.0.0:80 and the app builds every URL (including
   WS) from `window.location.host`. On the new network only three things
   matter: (a) Windows classifies a NEW network as **Public** by default —
   set it to Private (`Set-NetConnectionProfile -InterfaceAlias "Wi-Fi"
   -NetworkCategory Private`), or the firewall rule won't apply; (b) redo the
   DHCP reservation on the new router, update `SONGS_LAN_IP` in `docker/.env`
   followed by `docker compose up -d` (DNS container), and update any
   hosts-file entries that used the old IP; (c) the mDNS name
   (`http://<hostname>.local`) keeps working across router changes with no
   reconfiguration — it's the most durable client-facing address.

### `songs.lan` for every device: the bundled DNS container

The `dns` service (alpine + dnsmasq, `docker/dns/`) answers `songs.lan` →
`SONGS_LAN_IP` (from `docker/.env`) and immediately refuses every other name —
the right behavior for an offline LAN: clients fail fast instead of hanging on
timeouts. With `SONGS_LAN_IP` empty the container idles harmlessly.

Server side (once, admin PowerShell):

```powershell
# 1. Windows' Internet Connection Sharing service commonly squats on port 53
#    (it did on the church laptop, ZENBOOK-WINSYS). Free the port for good:
Stop-Service SharedAccess
Set-Service SharedAccess -StartupType Disabled   # re-enable only if Mobile Hotspot is ever needed

# 2. Let LAN clients reach the DNS:
New-NetFirewallRule -DisplayName "Songs offline DNS (UDP 53)" -Direction Inbound -Protocol UDP -LocalPort 53 -Action Allow -Profile Private,Domain
New-NetFirewallRule -DisplayName "Songs offline DNS (TCP 53)" -Direction Inbound -Protocol TCP -LocalPort 53 -Action Allow -Profile Private,Domain
```

While ICS runs, Docker may still manage to bind 53 alongside it (verified
answering correctly on 2026-07-22), but the boot-order race makes that
unreliable — disable ICS.

Then set `SONGS_LAN_IP=<reserved LAN IP>` in `docker/.env` and
`docker compose up -d`.

Router (TP-Link AC1200: Advanced → Network → DHCP Server): **Primary DNS** =
the laptop's reserved IP, Secondary — empty. Devices apply it when they
(re)join the Wi-Fi.

Verify: on the server `Resolve-DnsName songs.lan -Server 127.0.0.1` → the LAN
IP, `Resolve-DnsName ya.ru -Server 127.0.0.1` → "DNS operation refused"
(proves dnsmasq answers, not ICS); from a phone open `http://songs.lan/`.

## Offline limitations

- **Google login** doesn't work (GSI script can't load; button simply doesn't
  render). Every account needs a password — as of 2026-07-22 all 24 production
  users have one. New users: admin creates them in settings.
- **YouTube embeds** (media playlist items, sermon video chips) don't play.
  Locally uploaded video/audio (`tech_media`, `sermon_videos`) work fully.
- **Outgoing mail** (signup notifications) can't be sent; `smtp` config is
  intentionally omitted from the container config.
- **pptx import** needs the `WITH_PPTX=1` image (default).

## Moving to another machine / installing fully offline

On a machine that has internet once: install Docker Desktop, run the setup
above, then everything works offline forever. To clone onto a target with no
internet at all:

1. Copy the whole `C:\www\songs` folder (it already contains `vendor/`,
   `docker/.env`, `docker/config.container.php`, `docker/initdb/*.sql.gz` and
   all media — that folder IS the server).
2. Export/import the images:
   `docker save songs-offline-web mysql:5.7 -o songs-offline-images.tar`,
   copy, `docker load -i songs-offline-images.tar` on the target.
3. `cd docker && docker compose up -d` (no build, uses loaded images).

## Backing up the offline copy

Changes made on the offline copy (new sermons, setlists, uploads) exist ONLY
there — nothing syncs back to production. Before wiping volumes or re-importing:

```
docker exec songs-offline-db-1 sh -c "MYSQL_PWD=\"$MYSQL_PASSWORD\" mysqldump -usongs --no-tablespaces \"$MYSQL_DATABASE\"" | gzip > backup.sql.gz
```

(run via Git Bash; plus copy the four media dirs under `public/`). Merging such
changes back into production is a manual, case-by-case operation.

## Smoke check

After significant changes, run the 5-minute protocol from
`docs/deploy-checklist.md` §3 against `http://localhost/` (or `http://songs.lan/`).
Quick health probe:

```
curl -s -o /dev/null -w "%{http_code}\n" http://localhost/login        # 200
curl -s -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
     -H "Sec-WebSocket-Version: 13" http://localhost/ws | head -1      # 101
```
