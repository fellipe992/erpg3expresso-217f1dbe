<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the sales trainer's six tabs in an auto-height responsive grid, and allow book selectors to wrap; every option must remain visible on phones without horizontal scrolling.
- Official risk zones (origem `prf`/`ssp` in `zonas_risco`) are rebuilt only by `recalcular_zonas_oficiais()` from the aggregate tables, fed by `src/lib/zonas-oficiais.server.ts` (monthly cron route + admin button); never hand-edit them, and keep SSP regional zones out of point alerts/route scoring — they are too large to be actionable. The `zonas_oficiais_ssp_*` tables are multi-state despite the name: cargo-theft aggregates per UF (SP regions via SEADE, RJ municipalities via ISP-RJ, other states via SINESP), each UF with its own 3-year window, levels vs the national rate.
- The sales trainer's AI calls try the user's own GEMINI_API_KEY (free Google quota, light Flash/Flash-Lite-Image models only, never Pro) and fall back to the built-in AI gateway; GOOGLE_API_KEY stays reserved for Maps. Why: avoid spending workspace credits without the trainer going down.
