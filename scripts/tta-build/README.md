# TTA → FolkFriend Old Time Tune Data Pipeline

Scrapes Old Time tunes with ABC notation from the [Traditional Tune Archive](https://tunearch.org) 
and converts them into a FolkFriend-compatible JSON index for live tune identification.

## Pipeline Steps

1. **`tta-scraper.py`** — Queries TTA's Semantic MediaWiki API for all Old-Time tunes with ABC scores. 
   Extracts ABC notation from page wikitext, plus metadata (rhythm, key, mode, aliases).

2. **`generate_contours.py`** — Runs each ABC through `abc2midi` → MIDI → pitch contour string 
   (the same algorithm FolkFriend uses for matching).

3. **`tta-add-pageids.py`** — Fetches stable MediaWiki `page_id` for each tune page 
   (survives page renames, used as `tune_id` in the final output).

## Requirements

- Python 3.10+
- `abc2midi` (from [abcmidi](https://github.com/sshlien/abcmidi)) 
- `py_midicsv` Python package

## Usage

```bash
# Full rebuild (~45 min with rate limiting)
python3 tta-scraper.py --limit 0 --output tta-raw.json
python3 generate_contours.py tta-raw.json -o tta-contours.json
python3 tta-add-pageids.py tta-contours.json tta-final.json

# Then copy to src/listen/
cp tta-final.json ../../src/listen/oldtime-tune-data.json
```

## Output Format

Identical to FolkFriend's `folkfriend-non-user-data.json`:

```json
{
  "settings": {
    "1269": {
      "tune_id": "1269",
      "meter": "2/4",
      "mode": "Dmajor",
      "abc": "...",
      "composer": "",
      "dance": "reel",
      "contour": "..."
    }
  },
  "aliases": {
    "1269": ["angeline the baker", "angelina baker", "rocky road (1)"]
  }
}
```

- **Keys** are TTA MediaWiki `page_id` (stable across renames)
- **URLs**: `https://tunearch.org/w/index.php?curid={page_id}`
- **`setting_id`** equals `tune_id` (TTA has one setting per tune)
- **Source**: Traditional Tune Archive, CC BY-SA license

## Stats (as of 2026-03-15)

- 2,133 tunes with contours (out of 2,181 flagged Old-Time + ABC)
- 19 failed contour generation (malformed ABC)
- Top dance types: Reels (1,418), Waltzes (161), Airs (146), Rags (84)
- Top keys: G (644), D (545), A (373), C (297)
