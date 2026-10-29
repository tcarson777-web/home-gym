# Home Gym

A personal, offline-first workout app (PWA) for a garage gym: equipment profile,
strength + yoga/mobility sessions, one-tap set logging, and progress history.
All data is stored on the phone (IndexedDB). Weights are in lb.

## Using it

Open the GitHub Pages URL in Chrome on your phone → ⋮ menu → **Add to Home screen** (or **Install app**).

## Development

```bash
npm install
npm run dev      # local dev server
npx vitest run   # logic tests
npm run build    # production build into dist/
```

Every push to `main` is built and published by `.github/workflows/deploy.yml`.

## How plans are made

- `src/lib/planner.ts` — rule-based session builder (warm-up, main lifts, accessories, 45-min budget).
- `src/lib/progression.ts` — linear progression for barbell lifts, double progression for dumbbells/bodyweight.
- `src/lib/exercises.ts` — exercise library with required equipment.
- AI-generated plans (Claude API) come in v0.2 and will start from the rules-based plan. The API key is
  entered in the app and stored only on the device — never in this repository.
- `RecoverySignals` in `src/lib/types.ts` is the placeholder for future Fitbit / Google Health data.

## Roadmap

- v0.1 ✅ equipment, rules-based sessions, logging, history list, backup/restore, installable PWA
- v0.2 AI coach (Claude API) layered on the rules
- v0.3 progress charts and consistency view
- later: Fitbit / Google Health recovery data
