#!/bin/bash
# 用法: bash tools/_vshot.sh "<query>" <outname> [w] [h] [delay]
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
Q="$1"; OUT="$2"; W="${3:-1400}"; H="${4:-900}"; D="${5:-20000}"
UD="C:/Users/123/AppData/Local/Temp/cw-$(date +%s)-$RANDOM"
BASE="file:///C:/Users/123/WorkBuddy/2026-10-25-19-10-40/game/tools"
timeout 180 "$CH" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=$W,$H --virtual-time-budget=$D \
  --user-data-dir="$UD" --no-first-run --no-default-browser-check \
  --screenshot="C:/Users/123/WorkBuddy/2026-10-25-19-10-40/game/shots/$OUT.png" \
  "$BASE/$Q" 2>/dev/null
rm -rf "$UD" 2>/dev/null
if [ -f "shots/$OUT.png" ]; then echo "OK shots/$OUT.png $(stat -c%s "shots/$OUT.png")"; else echo "FAIL $OUT"; fi
