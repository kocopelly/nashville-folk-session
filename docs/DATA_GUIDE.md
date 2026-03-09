# Data Guide

How to add tunes and sessions to the set list tracker.

## Core Concepts

### Provider-agnostic links

Tune links are **full URLs stored in the data**, not constructed from provider IDs. This means:

- An Irish tune can link to [TheSession.org](https://thesession.org)
- A bluegrass tune can link to [Traditional Tune Archive](https://tunearch.org)
- A tune can link to a YouTube video, a personal website, or anything else
- A tune can have **no link at all** (just plain text)

### Link resolution (set view)

When displaying a tune in a set, the link is resolved in order:

1. **Set entry `url`** — if the entry has a `url`, use it (e.g. a specific TheSession setting)
2. **Tune `url`** — fall back to the tune's default link
3. **No link** — tune name renders as plain text

This means you can override a tune's default link per-set when you played a specific arrangement.

---

## Adding a Tune

Add an entry to `data/tunes.json`:

```json
"tune_009": {
  "id": "tune_009",
  "name": "Drowsy Maggie",
  "type": "reel",
  "tradition": "irish",
  "aliases": [],
  "commonKeys": ["Edor", "Em"],
  "url": "https://thesession.org/tunes/27",
  "external": { "thesession": 27 }
}
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Format: `tune_NNN` (sequential) |
| `name` | ✅ | Display name |
| `type` | ✅ | `reel`, `jig`, `slip jig`, `hornpipe`, `polka`, `breakdown`, `fiddle tune`, etc. |
| `tradition` | ✅ | `irish`, `bluegrass`, `old-time`, `scottish`, `other` |
| `aliases` | | Alternative names (empty array if none) |
| `commonKeys` | | Keys this tune is commonly played in, most frequent first |
| `url` | | Default link — any URL (TheSession, TTA, YouTube, etc.) |
| `external` | | Provider metadata for API lookups (not used for display links) |
| `notes` | | Freeform notes about the tune |

### TheSession tunes

For Irish tunes from TheSession:
- Set `url` to `https://thesession.org/tunes/{id}`
- Set `external.thesession` to the numeric tune ID (for potential API enrichment)

```json
"url": "https://thesession.org/tunes/182",
"external": { "thesession": 182 }
```

### Bluegrass / Old-time tunes

For tunes from the Traditional Tune Archive:
- Set `url` to the full TTA page URL
- Optionally set `external.tta` for the slug

```json
"url": "https://tunearch.org/wiki/Annotation:Salt_Creek",
"external": { "tta": "Salt_Creek" }
```

### Tunes with no online reference

Just omit `url` and `external`:

```json
"tune_010": {
  "id": "tune_010",
  "name": "Some Local Tune",
  "type": "reel",
  "tradition": "irish",
  "aliases": [],
  "commonKeys": ["D"]
}
```

---

## Adding a Series

A series is a recurring session (e.g. "Kocopelly Irish Session"). Add an entry to `data/series.json`:

```json
"station-inn": {
  "id": "station-inn",
  "name": "Station Inn Thursday Jam",
  "tradition": "bluegrass",
  "venue": "The Station Inn",
  "location": "Nashville, TN",
  "schedule": "Every Thursday",
  "organizer": "Someone",
  "description": "Weekly bluegrass jam.",
  "listed": true
}
```

### Series fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Lowercase slug (e.g. `kocopelly`, `station-inn`) |
| `name` | ✅ | Display name |
| `tradition` | ✅ | Default tradition for sessions in this series |
| `venue` | | Default venue name |
| `location` | | Default city, state |
| `schedule` | | Human-readable schedule (e.g. "Every Wednesday") |
| `organizer` | | Display name of the organizer |
| `description` | | Blurb for the series page |
| `url` | | External link (Facebook group, website, etc.) |
| `listed` | | `true` (default) or `false` to hide from public listings |

---

## Adding a Session

Sessions belong to a series. Fields on the session override series defaults (venue, location, tradition, organizer). If omitted, the series value is used.

Add an entry to `data/sessions.json`:

```json
{
  "id": "sess_2026-03-12",
  "seriesId": "kocopelly",
  "date": "2026-03-12",
  "sets": [
    {
      "tunes": [
        { "tuneId": "tune_001", "key": "D" },
        { "tuneId": "tune_002", "key": "D" }
      ],
      "notes": "Good energy opener"
    }
  ],
  "notes": "Rainy night but good turnout."
}
```

### Session fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Format: `sess_YYYY-MM-DD` (add `_2` etc. for multiple sessions per day) |
| `seriesId` | ✅ | References a series in `series.json` |
| `date` | ✅ | `YYYY-MM-DD` |
| `venue` | | Overrides series default |
| `location` | | Overrides series default |
| `tradition` | | Overrides series default |
| `organizer` | | Overrides series default |
| `sets` | ✅ | Array of sets (at least one) |
| `notes` | | Session-level notes |
| `attendees` | | Array of names (optional) |
| `links` | | Session-level attachments (photos, event pages, etc.) |

### Set fields

Each set object supports:

| Field | Required | Description |
|-------|----------|-------------|
| `label` | | Optional label, e.g. `"reels"`, `"jigs"`, `"slow set"` |
| `tunes` | ✅ | Array of tune entries (at least one) |
| `notes` | | Set-level notes |
| `links` | | Attachments for this set |

### Set tune entries

Each tune in a set can be a simple string (`"tune_001"`) or an object:

```json
{ "tuneId": "tune_001", "key": "D", "url": "https://..." }
```

| Field | Required | Description |
|-------|----------|-------------|
| `tuneId` | ✅ | References a tune in `tunes.json` |
| `key` | | Key as played in this set |
| `url` | | Overrides the tune's default link for this set entry |

### Linking to a specific TheSession setting

When you played a specific setting (arrangement) of a tune, override with the setting URL:

```json
{
  "tuneId": "tune_001",
  "key": "D",
  "url": "https://thesession.org/tunes/182#setting182"
}
```

The `#settingNNN` fragment links directly to that notation on TheSession. Without a `url` override, the tune name links to the tune's default `url` (the main tune page).

### Set attachments

Sets and sessions can have links/attachments:

```json
"links": [
  { "label": "Recording", "url": "https://example.com/set1.mp3", "type": "recording" },
  { "label": "Video", "url": "https://youtube.com/watch?v=...", "type": "video" }
]
```

Link types: `recording`, `video`, `photo`, `article`, `sheet-music`, `other`.

---

## Quick Reference: Adding an Irish Tune from TheSession

1. Find the tune on thesession.org — note the tune ID from the URL (e.g. `/tunes/27` → ID is `27`)
2. Add to `tunes.json` with `url` and `external.thesession`
3. In the session set entry, just use `tuneId` + `key` (links to tune page by default)
4. If you want to link to a **specific setting**, add `url` with the `#settingNNN` fragment

---

## Slime Notes 🫠

When KJ sends me a set list, I:
1. Look up tunes — add new ones to `tunes.json` (checking TheSession for IDs/keys)
2. Create the session entry in `sessions.json`
3. Open a PR for review
4. After merge → auto-deploy to Cloudflare Pages

If KJ mentions a specific setting/arrangement, I add the `url` override on the set entry.
If no setting is specified, the tune links to its default page.
