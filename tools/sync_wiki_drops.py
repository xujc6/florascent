import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REGIONS = ROOT / "regions.js"
OUT_JSON = ROOT / "assets" / "wiki_mob_drops.json"
OUT_JS = ROOT / "assets" / "wiki_mob_drops.js"
API = "https://florrio.wiki.gg/api.php"
RARITIES = "Common|Unusual|Rare|Epic|Legendary|Mythic|Ultra|Super|Eternal|Unique"
ALIASES = {
    "Evil Centipede": "Jungle Centipede",
    "Golden Leafbug": "Shiny Leafbug",
    "Dark Ladybug": "Jungle Ladybug",
    "Scuba Soldier Ant": "Diving Soldier Ant",
}
MOB_CONFLICTS = {"Dandelion", "Rock", "Cactus", "Bubble", "Sponge", "Crystal", "Square"}


def mob_pages():
    text = REGIONS.read_text(encoding="utf-8")
    found = re.findall(r"^  ([a-z0-9_]+):\{name:'([^']+)'", text, re.M)
    return [(key, ALIASES.get(name, name)) for key, name in found]


def fetch_wikitext(title):
    query = urllib.parse.urlencode({
        "origin": "*", "action": "parse", "page": title,
        "prop": "wikitext", "format": "json",
    })
    req = urllib.request.Request(
        API + "?" + query,
        headers={"User-Agent": "Mozilla/5.0 florr-wiki-sync/1.0", "Referer": "https://florrio.wiki.gg/"},
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                data = json.load(response)
            if "error" in data:
                info = data["error"].get("info", "wiki error")
                if data["error"].get("code") == "missingtitle":
                    raise FileNotFoundError(info)
                raise RuntimeError(info)
            return data["parse"]["wikitext"]["*"]
        except FileNotFoundError:
            raise
        except Exception:
            if attempt == 2:
                raise
            time.sleep(3 + attempt * 3)


def fetch_mob_page(title):
    candidates = [f"{title} (Mob)", title] if title in MOB_CONFLICTS else [title, f"{title} (Mob)"]
    last_error = None
    for candidate in candidates:
        try:
            return candidate, fetch_wikitext(candidate)
        except FileNotFoundError as exc:
            last_error = exc
    raise last_error or FileNotFoundError(title)


def write_output(output):
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(output, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    OUT_JS.write_text("window.WIKI_MOB_DROPS=" + json.dumps(output, ensure_ascii=True, separators=(",", ":")) + ";\n", encoding="utf-8")


def clean_name(value):
    value = re.sub(r"<!--.*?-->", "", value, flags=re.S)
    value = re.sub(r"\{\{[^{}]*\}\}", "", value)
    return value.strip().replace(" ", "_")


def parse_drops(text):
    section = re.search(r"==\s*Drops\s*==(?P<body>.*?)(?=\n==[^=]|\Z)", text, re.S | re.I)
    if not section:
        return {}, "no Drops section"
    body = section.group("body")
    result = {}
    row_re = re.compile(r"^\|\s*(" + RARITIES + r")\s*\|\|\s*(.*?)(?=\n\|-|\n\|\})", re.M | re.S)
    entry_re = re.compile(
        r"(?:\b(" + RARITIES + r")\s+)?"
        r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]\s*"
        r"([0-9]+(?:\.[0-9]+)?)%\s*(\([^;\n]*\))?",
        re.I,
    )
    for row in row_re.finditer(body):
        mob_rarity, raw = row.group(1), row.group(2).strip()
        entries = []
        for match in entry_re.finditer(raw):
            rarity = (match.group(1) or mob_rarity).title()
            condition = (match.group(4) or "").strip(" ()")
            entries.append({
                "petal": clean_name(match.group(2)),
                "rarity": rarity,
                "chance": float(match.group(3)) / 100,
                "condition": condition or None,
            })
        result[mob_rarity] = {"entries": entries, "raw": re.sub(r"\s+", " ", raw)}
    return result, None if result else "Drops section has no rarity table"


def main():
    if OUT_JSON.exists():
        output = json.loads(OUT_JSON.read_text(encoding="utf-8"))
    else:
        output = {"source": "https://florrio.wiki.gg/", "mobs": {}, "missing": {}}
    pages = mob_pages()
    for index, (key, title) in enumerate(pages, 1):
        if key in output["mobs"] and output["mobs"][key].get("drops"):
            print(f"[{index:02d}/{len(pages)}] {key}: already synced", flush=True)
            continue
        try:
            page, text = fetch_mob_page(title)
            drops, note = parse_drops(text)
            output["mobs"][key] = {"page": page, "drops": drops}
            if note:
                output["missing"][key] = note
            output["missing"].pop(key, None)
            print(f"[{index:02d}/{len(pages)}] {key}: {len(drops)} rarity rows", flush=True)
        except Exception as exc:
            output["missing"][key] = str(exc)
            print(f"[{index:02d}/{len(pages)}] {key}: ERROR {exc}", flush=True)
        write_output(output)
        time.sleep(0.4)
    write_output(output)
    covered = sum(bool(v["drops"]) for v in output["mobs"].values())
    print(f"wrote {OUT_JSON} and {OUT_JS}; {covered}/{len(pages)} pages have parsed drop tables")


if __name__ == "__main__":
    main()
