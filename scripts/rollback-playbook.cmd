@echo off
rem Click-to-run wrapper for the rollback playbook (TESTING.md section 7).
rem Uses your local wrangler OAuth login; contains no secrets.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback-playbook.ps1"
pause
