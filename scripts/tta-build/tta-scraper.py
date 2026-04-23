#!/usr/bin/env python3
"""
Traditional Tune Archive → FolkFriend data scraper (proof of concept).

Pulls Old-Time tunes with ABC notation from tunearch.org via their 
Semantic MediaWiki + MediaWiki APIs and outputs a JSON file compatible
with FolkFriend's folkfriend-non-user-data.json format.

Phase 1: Scrape tune metadata and ABC
Phase 2 (future): Generate MIDI contours via abc2midi pipeline
"""

import json
import re
import time
import sys
import urllib.request
import urllib.parse
import urllib.error

BASE = "https://tunearch.org/w/api.php"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
RATE_LIMIT = 1.0  # seconds between requests

def api_get(params):
    """Make a GET request to the TTA MediaWiki API."""
    params['format'] = 'json'
    url = f"{BASE}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except (urllib.error.URLError, urllib.error.HTTPError) as e:
            print(f"  Retry {attempt+1}/3: {e}", file=sys.stderr)
            time.sleep(2 ** attempt)
    return None

def get_oldtime_tune_names(limit=None):
    """Get all Old-Time tune page names that have ABC scores."""
    tunes = []
    offset = 0
    batch = 500
    
    while True:
        print(f"  Fetching tune list offset={offset}...", file=sys.stderr)
        # SMW ask query: tunes with Has_genre::Old-Time AND Has_Score::t
        # Note: printout property names use underscores in the query
        query = f"[[Category:Tune]][[Has_genre::Old-Time]][[Has_Score::t]]|?Has_rhythm|?Is_in_the_key_of|?Has_mode|?Has_time_signature|?Is_also_known_as|?Has_structure|limit={batch}|offset={offset}"
        
        data = api_get({'action': 'ask', 'query': query})
        if not data or 'query' not in data:
            print(f"  API error at offset {offset}", file=sys.stderr)
            break
        
        results = data['query']['results']
        if not results:
            break
            
        for name, info in results.items():
            po = info.get('printouts', {})
            # SMW returns property names with spaces in printouts
            def get_po(key):
                """Get first printout value, trying both space and underscore variants."""
                for k in [key, key.replace('_', ' ')]:
                    vals = po.get(k, [])
                    if vals:
                        v = vals[0]
                        return v.get('fulltext', v) if isinstance(v, dict) else v
                return ''
            
            def get_po_list(key):
                """Get all printout values as strings."""
                for k in [key, key.replace('_', ' ')]:
                    vals = po.get(k, [])
                    if vals:
                        return [v.get('fulltext', v) if isinstance(v, dict) else v for v in vals]
                return []
            
            tunes.append({
                'page': info['fulltext'],
                'url': info['fullurl'],
                'rhythm': get_po('Has_rhythm'),
                'key': get_po('Is_in_the_key_of'),
                'mode': get_po('Has_mode'),
                'time_sig': get_po('Has_time_signature'),
                'aliases': get_po_list('Is_also_known_as'),
                'structure': get_po('Has_structure'),
            })
        
        count = len(results)
        offset += count
        print(f"  Got {count} tunes (total: {len(tunes)})", file=sys.stderr)
        
        if limit and len(tunes) >= limit:
            tunes = tunes[:limit]
            break
            
        # Check if more results
        if 'query-continue-offset' not in data:
            break
            
        time.sleep(RATE_LIMIT)
    
    return tunes

def extract_abc_from_wikitext(wikitext):
    """Extract ABC notation from between <section begin=abc /> ... <section end=abc /> tags."""
    pattern = r'<section\s+begin=abc\s*/>(.*?)<section\s+end=abc\s*/>'
    match = re.search(pattern, wikitext, re.DOTALL)
    if match:
        abc = match.group(1).strip()
        return abc
    return None

def fetch_abc(page_name):
    """Fetch ABC notation for a single tune page."""
    data = api_get({
        'action': 'parse',
        'page': page_name,
        'prop': 'wikitext',
    })
    if not data or 'parse' not in data:
        return None
    
    wikitext = data['parse']['wikitext']['*']
    return extract_abc_from_wikitext(wikitext)

def parse_abc_fields(abc_text):
    """Extract key, meter, title from ABC header fields."""
    fields = {}
    for line in abc_text.split('\n'):
        line = line.strip()
        if len(line) >= 2 and line[1] == ':' and line[0].isalpha():
            key = line[0]
            val = line[2:].strip()
            if key not in fields:  # first occurrence wins
                fields[key] = val
    return fields

def normalize_mode(key_field, mode_from_smw):
    """Convert TTA key/mode info to FolkFriend format like 'Dmajor', 'Aminor'."""
    if not key_field:
        return ''
    
    # Clean up key - TTA sometimes gives "A Mix", "A Dor", etc.
    key = key_field.strip() if isinstance(key_field, str) else str(key_field)
    
    # If key contains a mode hint (e.g. "A Mix", "D Dor"), extract it
    key_parts = key.split()
    actual_key = key_parts[0] if key_parts else key
    key_mode_hint = key_parts[1].lower() if len(key_parts) > 1 else ''
    
    # Map mode names from SMW property
    mode_str = mode_from_smw.strip() if isinstance(mode_from_smw, str) else str(mode_from_smw)
    mode_map = {
        'Ionian (Major)': 'major',
        'Ionian': 'major',
        'Major': 'major',
        'Aeolian (Natural Minor)': 'minor',
        'Aeolian': 'minor',
        'Minor': 'minor',
        'Dorian': 'dorian',
        'Mixolydian': 'mixolydian',
        'Lydian': 'lydian',
        'Phrygian': 'phrygian',
        'Locrian': 'locrian',
    }
    
    # Key-embedded mode hints (from key field like "A Mix")
    key_hint_map = {
        'mix': 'mixolydian',
        'mixo': 'mixolydian',
        'dor': 'dorian',
        'min': 'minor',
        'm': 'minor',
        'maj': 'major',
    }
    
    # Prefer SMW mode, fall back to key hint
    mode = mode_map.get(mode_str, '')
    if not mode and key_mode_hint:
        mode = key_hint_map.get(key_mode_hint, 'major')
    if not mode:
        mode = 'major'
    
    return f"{actual_key}{mode}"

def normalize_dance(rhythm):
    """Convert TTA rhythm to FolkFriend dance type."""
    if not rhythm:
        return 'reel'
    
    r = rhythm.lower() if isinstance(rhythm, str) else str(rhythm).lower()
    
    if 'reel' in r:
        return 'reel'
    elif 'jig' in r:
        if 'slip' in r:
            return 'slip jig'
        return 'jig'
    elif 'hornpipe' in r:
        return 'hornpipe'
    elif 'polka' in r:
        return 'polka'
    elif 'waltz' in r:
        return 'waltz'
    elif 'march' in r:
        return 'march'
    elif 'strathspey' in r:
        return 'strathspey'
    elif 'schottische' in r:
        return 'schottische'
    else:
        return r  # pass through

def extract_abc_body(abc_text):
    """Extract just the tune body (notes) from ABC, stripping header lines."""
    lines = []
    in_body = False
    for line in abc_text.split('\n'):
        line = line.strip()
        if not line:
            continue
        # Header lines: single letter + colon
        if len(line) >= 2 and line[1] == ':' and line[0].isalpha() and not in_body:
            if line[0] == 'K':  # K: is last header, body follows
                in_body = True
            continue
        if in_body or (not (len(line) >= 2 and line[1] == ':' and line[0].isalpha())):
            in_body = True
            lines.append(line)
    return '\n'.join(lines)

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Scrape TTA Old-Time tunes for FolkFriend')
    parser.add_argument('--limit', type=int, default=50, help='Max tunes to fetch (default: 50 for POC)')
    parser.add_argument('--list-only', action='store_true', help='Just list tune names, no ABC fetch')
    parser.add_argument('--output', default=None, help='Output JSON file')
    args = parser.parse_args()
    
    print(f"=== TTA Old-Time Scraper ===", file=sys.stderr)
    print(f"Fetching tune list (limit={args.limit})...", file=sys.stderr)
    
    tunes = get_oldtime_tune_names(limit=args.limit)
    print(f"\nFound {len(tunes)} tunes with Old-Time genre + ABC scores", file=sys.stderr)
    
    if args.list_only:
        for t in tunes:
            aliases = ', '.join(t['aliases'][:3]) if t['aliases'] else ''
            rhythm = t['rhythm'].get('fulltext', t['rhythm']) if isinstance(t['rhythm'], dict) else t['rhythm']
            key = t['key'].get('fulltext', t['key']) if isinstance(t['key'], dict) else t['key']
            print(f"  {t['page']} [{rhythm}] [{key}] aka: {aliases}")
        return
    
    # Phase 1: Fetch ABC for each tune
    settings = {}
    aliases = {}
    success = 0
    fail = 0
    
    for i, tune in enumerate(tunes):
        page = tune['page']
        print(f"[{i+1}/{len(tunes)}] Fetching ABC: {page}...", file=sys.stderr)
        
        abc = fetch_abc(page)
        time.sleep(RATE_LIMIT)
        
        if not abc:
            print(f"  SKIP: no ABC found", file=sys.stderr)
            fail += 1
            continue
        
        # Parse ABC fields
        abc_fields = parse_abc_fields(abc)
        abc_body = extract_abc_body(abc)
        
        if not abc_body.strip():
            print(f"  SKIP: empty ABC body", file=sys.stderr)
            fail += 1
            continue
        
        # Extract metadata
        rhythm = tune['rhythm']
        if isinstance(rhythm, dict):
            rhythm = rhythm.get('fulltext', '')
        key = tune['key']
        if isinstance(key, dict):
            key = key.get('fulltext', '')
        mode = tune['mode']
        if isinstance(mode, dict):
            mode = mode.get('fulltext', '')
        time_sig = tune['time_sig']
        if isinstance(time_sig, dict):
            time_sig = time_sig.get('fulltext', '')
        
        # Use a stable ID based on index (real version would use a hash or TTA page ID)
        setting_id = f"tta_{i}"
        tune_id = f"tta_{i}"
        
        meter = abc_fields.get('M', time_sig or '4/4')
        mode_str = normalize_mode(key or abc_fields.get('K', ''), mode)
        dance = normalize_dance(rhythm)
        
        settings[setting_id] = {
            'tune_id': tune_id,
            'meter': meter,
            'mode': mode_str,
            'abc': abc_body,
            'composer': '',
            'dance': dance,
            'contour': '',  # Phase 2: generate via abc2midi pipeline
            'source': 'tta',
            'source_page': page,
        }
        
        # Build aliases
        alias_list = [page.lower()]
        for a in tune['aliases']:
            if isinstance(a, dict):
                a = a.get('fulltext', '')
            if a:
                alias_list.append(a.lower())
        aliases[tune_id] = alias_list
        
        success += 1
        print(f"  OK: {dance} in {mode_str}, {len(abc_body)} chars ABC", file=sys.stderr)
    
    print(f"\n=== Results ===", file=sys.stderr)
    print(f"Success: {success}, Failed: {fail}", file=sys.stderr)
    
    output = {
        'settings': settings,
        'aliases': aliases,
        'meta': {
            'source': 'Traditional Tune Archive (tunearch.org)',
            'genre': 'Old-Time',
            'license': 'CC BY-SA',
            'scraped_at': time.strftime('%Y-%m-%dT%H:%M:%SZ'),
            'note': 'Contours not yet generated - need abc2midi pipeline',
        }
    }
    
    if args.output:
        with open(args.output, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"Written to {args.output}", file=sys.stderr)
    else:
        json.dump(output, sys.stdout, indent=2)

    # Print some stats
    dances = {}
    modes = {}
    for s in settings.values():
        dances[s['dance']] = dances.get(s['dance'], 0) + 1
        modes[s['mode']] = modes.get(s['mode'], 0) + 1
    
    print(f"\n=== Stats ===", file=sys.stderr)
    print(f"Dance types: {json.dumps(dances, indent=2)}", file=sys.stderr)
    print(f"Modes: {json.dumps(dict(sorted(modes.items(), key=lambda x: -x[1])[:10]), indent=2)}", file=sys.stderr)

if __name__ == '__main__':
    main()
