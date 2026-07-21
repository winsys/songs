@echo off
rem Sync the offline Docker copy from production (wrapper for Git Bash users).
rem Usage: tools\offline_sync.cmd [all|config|db|media]
bash "%~dp0offline_sync.sh" %*
