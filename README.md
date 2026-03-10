# Nashville Folk Session

A weekly set list tracker for Nashville's Irish & folk music sessions. Browse what was played, find sheet music links, and discover the local tradition.

**[Live site →](https://nashville-folk-session.pages.dev)** _(Cloudflare Pages)_

## What this is

After each session, the set lists get logged here — every tune linked to its sheet music and recordings on [TheSession.org](https://thesession.org). Think of it as a living tunebook for Nashville's folk scene.

Whether you're a regular looking to practice what got played last week, a newcomer figuring out what to learn, or just curious — this is for you.

## How it works

1. After a session, KJ sends [Slime](https://github.com/slime-the-bot) 🫠 the set list
2. Slime enriches the data — looks up each tune on TheSession, finds the right settings (transcriptions), links everything together
3. Slime opens a PR with the structured data
4. Review & merge → auto-deploy to Cloudflare Pages

## Stack

- **[Eleventy](https://www.11ty.dev/)** — static site generator
- **[Tailwind CSS v4](https://tailwindcss.com/)** — styling (letterpress/folk poster aesthetic)
- **TypeScript + [Zod](https://zod.dev/)** — data validation
- **Cloudflare Pages** — hosting (via Wrangler)
- **GitHub Actions** — validate, build, deploy on merge

## Data model

Tune and session data lives in JSON under `data/`:

| File | Purpose |
|------|---------|
| `data/tunes.json` | Tune registry — name, key, type, tradition, TheSession links |
| `data/sessions.json` | Session log — date, venue, sets (ordered tune lists), notes |
| `data/series.json` | Recurring session series — venue defaults, schedule, organizers |
| `data/schema.ts` | Zod schemas for all of the above |

Tune links are **provider-agnostic** — full URLs stored in data. Works with TheSession, Traditional Tune Archive, or any source.

See **[docs/DATA_GUIDE.md](docs/DATA_GUIDE.md)** for the complete guide on adding tunes and sessions.

## Development

```bash
npm install
npm run dev        # local dev server (Eleventy + Tailwind watch)
npm run build      # production build
npm run validate   # validate data against Zod schemas
npm run typecheck  # TypeScript type check
npm run lint       # ESLint + Prettier
```

## Contributing

Run a session in Nashville? Want your set lists on here? Have a correction?

- **Open an issue** or PR on this repo
- **Email** kjkrause97@gmail.com
- **At the session** — find KJ, he's the one with the fiddle

---

Maintained by [KJ Krause](https://github.com/kocopelly) and [Slime](https://github.com/slime-the-bot) 🫠
