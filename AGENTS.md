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
- Official risk zones (origem `prf`/`ssp` in `zonas_risco`) are rebuilt only by `recalcular_zonas_oficiais()` from the aggregate tables, fed by `src/lib/zonas-oficiais.server.ts` (monthly cron route + admin button); never hand-edit them, and keep SSP regional zones out of point alerts/route scoring — they are too large to be actionable.
