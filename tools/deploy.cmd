@echo off
rem Deploy songs to production: pull the pushed master on the server.
rem Fails fast (10s) if the host is unreachable instead of hanging.
ssh -o ConnectTimeout=10 root@server.winsys.lv "cd /srv/songs && git pull"
