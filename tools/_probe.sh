#!/bin/bash
# 用法: bash tools/_probe.sh "<query>" [delay_ms]
#   从 --dump-dom 的 <title> 里读出引擎运行统计（需要 ?auto=1&probe=1）
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
Q="$1"; D="${2:-6000}"
UD="C:/Users/123/AppData/Local/Temp/cp-$(date +%s)-$RANDOM"
BASE="file:///C:/Users/123/WorkBuddy/2026-10-25-19-10-40/game/index.html"
timeout 80 "$CH" --headless=new --disable-gpu --virtual-time-budget=$D \
  --user-data-dir="$UD" --no-first-run --no-default-browser-check --dump-dom \
  "$BASE$Q" 2>/dev/null | tr -d '\n' | sed -n 's/.*<title>\(.*\)<\/title>.*/\1/p'
rm -rf "$UD" 2>/dev/null
