#!/usr/bin/env python3
"""Fetch MediaWiki page IDs for all TTA tunes and add to the data JSON."""

import json
import sys
import time
import urllib.request
import urllib.parse

BASE = "https://tunearch.org/w/api.php"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"

def get_page_ids(page_names):
    """Fetch page IDs for a batch of page names (max 50 per request)."""
    ids = {}
    for i in range(0, len(page_names), 50):
        batch = page_names[i:i+50]
        titles = '|'.join(batch)
        params = {
            'action': 'query',
            'titles': titles,
            'format': 'json',
        }
        url = f"{BASE}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = json.loads(resp.read())
                break
            except Exception as e:
                print(f"  Retry {attempt+1}: {e}", file=sys.stderr)
                time.sleep(2)
        else:
            continue
        
        # Map normalized titles back
        norm_map = {}
        for n in data.get('query', {}).get('normalized', []):
            norm_map[n['to']] = n['from']
        
        for pid, page in data.get('query', {}).get('pages', {}).items():
            if int(pid) > 0:
                title = page['title']
                ids[title] = int(pid)
                # Also map the original (unnormalized) name
                if title in norm_map:
                    ids[norm_map[title]] = int(pid)
        
        print(f"  Batch {i//50 + 1}: got {len(data.get('query', {}).get('pages', {}))} IDs", file=sys.stderr)
        time.sleep(0.5)
    
    return ids

def main():
    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else input_path
    
    with open(input_path) as f:
        data = json.load(f)
    
    # Collect all page names
    page_names = []
    for sid, setting in data['settings'].items():
        page = setting.get('source_page', '')
        if page:
            page_names.append(page)
    
    print(f"Fetching page IDs for {len(page_names)} tunes...", file=sys.stderr)
    page_ids = get_page_ids(page_names)
    print(f"Got {len(page_ids)} page IDs", file=sys.stderr)
    
    # Add page IDs to settings
    found = 0
    missing = 0
    for sid, setting in data['settings'].items():
        page = setting.get('source_page', '')
        if page in page_ids:
            setting['page_id'] = page_ids[page]
            found += 1
        else:
            setting['page_id'] = None
            missing += 1
    
    print(f"Matched: {found}, Missing: {missing}", file=sys.stderr)
    
    with open(output_path, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Written to {output_path}", file=sys.stderr)

if __name__ == '__main__':
    main()
