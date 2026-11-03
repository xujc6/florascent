#!/bin/bash
# 截图任意本地页面: bash tools/_page.sh "<相对路径?query>" <outname> [w] [h] [budget]
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
P="$1"
OUT="$2"
W="${3:-1200}"
H="${4:-1200}"
D="${5:-8000}"
BASE="file:///C:/Users/123/WorkBuddy/2026-10-25-19-10-40/game/"
UD="C:/Users/123/AppData/Local/Temp/cp-$(date +%s)-$RANDOM"
timeout 120 "$CH" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
  --window-size=$W,$H --virtual-time-budget=$D \
  --user-data-dir="$UD" --no-first-run --no-default-browser-check \
  --screenshot="C:/Users/123/WorkBuddy/2026-10-25-19-10-40/game/shots/$OUT.png" \
  "$BASE$P" 2>/dev/null
rm -rf "$UD" 2>/dev/null
if [ -f "shots/$OUT.png" ]; then echo "OK shots/$OUT.png $(stat -c%s "shots/$OUT.png")"; else echo "FAIL $OUT"; fi
