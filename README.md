## AI Party Studio

Generate cohesive printable decorations for kids parties. The studio is built with the Next.js App Router, Tailwind CSS v4, and the Vercel AI SDK v5 wired to OpenRouter for `google/gemini-2.5-flash-image`.

Features:

- Create multiple “party projects” and persist their history locally.
- Attach reference inspiration images per iteration (stored client-side, forwarded to the model payload).
- Generate up to six decoration variants at once with custom decoration focuses and canvas sizes.
- Review previous generations, download assets, or reuse the original settings.

## Environment variables

Create an `.env.local` file with your OpenRouter API key:

```
OPENROUTER_API_KEY=sk-or-v1-...
# Optional overrides
OPENROUTER_MODEL_ID=google/gemini-2.5-flash-image
OPENROUTER_SITE_URL=http://localhost:3000
OPENROUTER_APP_NAME=AI Party Studio
```

The API route will throw if `OPENROUTER_API_KEY` is missing. Get your API key from [OpenRouter](https://openrouter.ai/).

## Development

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to use the studio.

## Production build

```bash
npm run build
npm start
```

## Notes

- Image generation is handled via `app/api/generate/route.ts`, which calls the custom OpenRouter provider in `lib/gateway.ts`.
- Project history is stored in `localStorage` so asset histories remain on the device only.
