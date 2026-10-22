Federal Register of Legislation API responses (`Titles('<id>')?$expand=…parliamentaryScrutiny,parliamentaryScrutinySummary`), retrieved 22 Oct 2026 with the Policai identity.

- `F2026L01223.json` is verbatim.
- The others are excerpts of the live responses: the fields the parser reads, with their live values; unused fields and the `@odata` wrapper are dropped. `asMadeRegisteredAt` for F2024L00850 and F2024L01303 is set to the first in-force day, as the probe reported only that.
- `search-affects-F2026L01223-amending.json` is the `value` of the live `Titles/Search(criteria='affects("F2026L01223",[amending])')` response, without the `@odata` wrapper.
- `F2017L01474.versions.json` holds the one future version of the principal rules that F2026L01223 amends, verbatim; the live response also lists earlier versions that other instruments start.
- `search-ai-instruments.json` is the first 3 rows of the live AI full-text search (`frlAiInstrumentSearch()`), verbatim, retrieved 22 Oct 2026; the live response held 20 rows of 75.
