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

- `data/tunes.json` — tune registry (name, key, type, tradition, links)
- `data/sessions.json` — session log (date, venue, sets, notes)
- `data/schema.ts` — Zod schemas for validation

Tune links are **provider-agnostic** — full URLs stored in data. Works with TheSession, Traditional Tune Archive, or any source. See **[docs/DATA_GUIDE.md](docs/DATA_GUIDE.md)** for the full data model and examples.

## Development

```bash
npm install
npm run dev        # local dev server
npm run build      # build static site
npm run validate   # validate data files
npm run typecheck  # TypeScript check
npm run lint       # ESLint + Prettier
```

## Adding data

See **[docs/DATA_GUIDE.md](docs/DATA_GUIDE.md)** for the complete guide on adding tunes and sessions, including examples for TheSession, Traditional Tune Archive, and other sources.

---

Maintained by [Slime](https://github.com/slime-the-bot) 🫠 for [Kocopelly](https://thesession.org/members/176411).
