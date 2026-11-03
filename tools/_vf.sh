#!/bin/bash
# _vf.sh <t> <out>
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"
UD="C:/Users/123/AppData/Local/Temp/cf-$(date +%s%N)-$RANDOM"
timeout 90 "$CH" --headless=new --disable-gpu --hide-scrollbars \
  --window-size=1280,720 --virtual-time-budget=8000 \
  --user-data-dir="$UD" --no-first-run --no-default-browser-check \
  --screenshot="C:/Users/123/WorkBuddy/2026-10-25-19-10-40/game/shots/$2.png" \
  "file:///C:/Users/123/WorkBuddy/2026-10-25-19-10-40/game/tools/_vid.html?t=$1" 2>/dev/null
rm -rf "$UD" 2>/dev/null
