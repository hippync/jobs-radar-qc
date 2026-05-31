# Screenshots

Drop screenshots here before sharing the repo or updating the README demo links.

## What to capture

| File | What to show |
|---|---|
| `home.png` | Home page with job list and filters visible (stack, seniority, remote toggles) |
| `trends.png` | Tech Stack Radar (`/trends`) with several technology bars visible |
| `trends-segment.png` | `/trends` with a segment filter active (e.g. AI/ML or Startup SaaS) — bars reflect the filtered subset |
| `debug-extraction.png` | Terminal output of `scripts/debug_extraction.py` showing evidence JSON for a real job |
| `github-actions.png` | GitHub Actions tab showing a successful `daily_fetch` and `weekly_enrich` run |
| `supabase.png` _(optional)_ | Supabase Table Editor or SQL result from `active_qc_jobs` view — with all sensitive values hidden |

## Recommended capture steps

1. Run `npm run dev` in `frontend/` (requires `frontend/.env.local` with Supabase public keys)
2. Open `http://localhost:3000` and set filters to show a realistic-looking result set
3. Navigate to `http://localhost:3000/trends` for the radar view
4. Run `python scripts/debug_extraction.py <lever-or-greenhouse-url>` in a terminal for the debug screenshot

## Security checklist before committing screenshots

- No API keys visible in any screenshot
- No `SUPABASE_SERVICE_ROLE_KEY` visible (check browser DevTools, terminal history)
- No private environment variable values visible in terminal output
- Supabase screenshots: blur or crop out any email addresses, user IDs, or internal project URLs
- GitHub Actions screenshots: the run log is fine to show; avoid showing secrets in step outputs
