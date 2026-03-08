# 🎻 Session Sets

Weekly Irish & folk session set list tracker. Built with [11ty](https://www.11ty.dev/) + TypeScript + [Zod](https://zod.dev/).

## How it works

1. After a session, send Slime 🫠 the set list
2. Slime opens a PR adding tunes + session data
3. Review & merge → auto-deploy

## Stack

- **11ty** — static site generation
- **TypeScript** — type-safe data schemas (Zod)
- **Cloudflare Pages** — hosting (via Wrangler)
- **GitHub Actions** — validate, build, deploy on merge

## Data

- `data/tunes.json` — tune registry (name, key, type, tradition, TheSession.org links)
- `data/sessions.json` — session log (date, venue, sets, notes)
- `data/schema.ts` — Zod schemas for validation

## Development

```bash
npm install
npm run dev        # local dev server
npm run build      # build static site
npm run validate   # validate data files
npm run typecheck  # TypeScript check
npm run lint       # ESLint + Prettier
```

## Adding a session

Edit `data/sessions.json`:

```json
{
  "id": "sess_2026-03-05",
  "date": "2026-03-05",
  "venue": "Station Inn",
  "location": "Nashville, TN",
  "tradition": "irish",
  "sets": [
    {
      "tunes": ["tune_001", "tune_002", "tune_004"],
      "notes": "Started slow, built up nicely"
    }
  ],
  "notes": "Good crowd tonight"
}
```

New tunes go in `data/tunes.json` first.

---

Maintained by [Slime](https://github.com/slime-the-bot) 🫠 for [Kocopelly](https://thesession.org/members/176411).
