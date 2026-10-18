# Analysis

`/analysis` lists published pieces (weekly briefings, instrument notes, explainers). Each opens at `/analysis/<slug>` with the tier label, byline, AI disclosure, figures, citations and corrections.

## Sub-features

- `analysis-index` lists published pieces with type filter links `All`, `Weekly briefing`, `Instrument note`, `Explainer`.
- `analysis-article` renders a piece, its figures, sources, lead image with attribution, and "Source under review" when a citation is not current.
- `analysis-withdrawn` shows a withdrawal notice for withdrawn pieces; drafts are 404.
- `analysis-feed` serves Atom at `/analysis/feed.xml`.

## How to get to it (user POV)

- Choose `link "Analysis"` in the header.
- Choose a type filter, then a piece.
- Choose an entry under `heading "Analysis citing this record"` on a policy page.
- Subscribe to `link "Analysis feed (Atom)"`.

## Driving it with Playwright

Preconditions:

- Doctor is green. Published pieces exist in `data/articles/`, for example `how-ai-is-regulated-in-australia`.
- For figure, image and withdrawn cases, start with `POLICAI_ARTICLES_DIR=$PWD/src/test/fixtures/articles`.

- **Index.** Run `$V snap <port> /analysis analysis-index`. `main h1` is `Analysis`; four filter links appear.
- **Article.** Run `$V snap <port> /analysis/how-ai-is-regulated-in-australia analysis-article` and `--dark`. The snapshot shows the tier label, byline and disclosure text.
- **Feed.** Run `curl -s http://127.0.0.1:<port>/analysis/feed.xml | head -c 300`. Starts with an Atom `<feed`.

## Gotchas

- `/analysis/[slug]` is `force-dynamic`; chart counts and the "as at" date are computed per request in Australia/Sydney.
- Fixture articles replace the real ones for the whole instance; restart without `POLICAI_ARTICLES_DIR` to return to real data.
