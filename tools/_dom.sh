#!/bin/bash
# 用法: bash tools/_dom.sh "<query>" [delay_ms]   输出页面纯文本（去标签）
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
Q="$1"; D="${2:-5000}"
UD="C:/Users/123/AppData/Local/Temp/cd-$(date +%s)-$RANDOM"
BASE="file:///C:/Users/123/WorkBuddy/2026-10-25-19-10-40/game/tools"
timeout 60 "$CH" --headless=new --disable-gpu --virtual-time-budget=$D \
  --user-data-dir="$UD" --no-first-run --no-default-browser-check --dump-dom \
  "$BASE/$Q" 2>/dev/null | sed -e 's/<pre[^>]*>/\n/g' -e 's/<\/pre>/\n/g' -e 's/<[^>]*>//g'
rm -rf "$UD" 2>/dev/null
