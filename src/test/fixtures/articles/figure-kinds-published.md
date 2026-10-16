---
type: explainer
title: "Fixture explainer with one figure of each kind"
summary: A fixture explainer that renders a timeline, a comparison, a process and a register chart in document order.
status: published
publishedAt: 2026-10-16
cites:
  - nsw-identifying-ai-guidance
  - fwc-genai-guidance-note
  - oaic-app-1-7-adm-transparency-guidance
  - federal-court-gpn-ai
  - nsw-supreme-court-sc-gen-23
  - nsw-ai-operational-policy
  - nsw-artificial-intelligence-assessment-framework
sources:
  - https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Environment_and_Communications/AIdatacentres48P
  - https://www.oaic.gov.au/__data/assets/pdf_file/0021/269013/APP-1.7-1.9-Transparency-Obligation-Fact-Sheet.PDF
  - https://www.fwc.gov.au/documents/resources/guidance-note-use-of-generative-ai-in-commission-cases.pdf
---

Four dates fall before the end of the year.

```figure
kind: timeline
title: Four dates fall between now and the end of the year
alt: "Four dates: the NSW AIAF Platform requirement began on 30 September, the Fair Work Commission note starts on 20 October, the Senate committee reports on 16 November, and the OAIC transparency duty applies from 10 December."
caption: Dates as recorded in the register and on the official pages at 16 October 2026.
asAt: 2026-10-16
cites: [nsw-identifying-ai-guidance, fwc-genai-guidance-note, oaic-app-1-7-adm-transparency-guidance]
sources:
  - https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Environment_and_Communications/AIdatacentres48P
entries:
  - date: 2026-09-30
    title: NSW AIAF Platform becomes the authoritative channel
    detail: All agencies must register their AI use cases.
  - date: 2026-10-20
    title: Fair Work Commission guidance note commences
  - date: 2026-11-16
    title: Senate committee due to report on AI and data centres
  - date: 2026-12-10
    title: APP 1.7 to 1.9 transparency obligation applies
```

## What do courts and tribunals require?

Three courts require disclosure.

```figure
kind: matrix
title: Three courts require disclosure of AI use, and only one of them restricts what AI may write for it
alt: "Comparison of three courts: the Federal Court may require disclosure, the NSW Supreme Court limits what AI may draft, and the Fair Work Commission requires disclosure and a human check from 20 October 2026."
caption: What each court's AI instrument requires, as recorded in the register at 16 October 2026.
wide: true
cites: [federal-court-gpn-ai, nsw-supreme-court-sc-gen-23, fwc-genai-guidance-note]
sources:
  - https://www.fwc.gov.au/documents/resources/guidance-note-use-of-generative-ai-in-commission-cases.pdf
  - https://www.oaic.gov.au/__data/assets/pdf_file/0021/269013/APP-1.7-1.9-Transparency-Obligation-Fact-Sheet.PDF
  - https://www.aph.gov.au/Parliamentary_Business/Committees/Senate/Environment_and_Communications/AIdatacentres48P
columns: [Court, Instrument, Who it covers, What it requires]
rows:
  - [Federal Court, GPN-AI, Everyone who appears before or files documents with the Court, Disclosure of AI use may be required]
  - - Supreme Court of NSW
    - Practice Note SC Gen 23, from 3 Feb 2025
    - Parties and practitioners
    - text: No generative AI to produce affidavit or witness-statement content, and leave is needed before AI is used for an expert report, which the Court treats as a separate step with its own conditions.
      emphasis: true
  - [Fair Work Commission, "Guidance note, from 20 Oct 2026", ~, Disclose the use and state that a person checked the document]
```

## Who registers?

One answer decides whether the agency registers.

```figure
kind: flow
title: One answer to the AI questions decides whether the agency registers
alt: "Flow: agencies answer the Identifying AI questions. A yes to any AI question leads to registration in the AIAF Platform, which decides whether an assessment is needed and sends high or critical risk uses to the AI Review Committee. All non-AI answers lead to a documented decision."
caption: The registration path in the NSW Identifying AI guidance at 16 October 2026.
wide: true
cites: [nsw-identifying-ai-guidance, nsw-ai-operational-policy, nsw-artificial-intelligence-assessment-framework]
steps:
  - text: Answer the Identifying AI questions
    role: decision
  - text: Register the use case in the AIAF Platform
    label: Yes to any AI question
  - text: Registration decides whether an AIAF assessment is needed
  - text: High or critical risk goes to the AI Secretariat for the NSW AI Review Committee
    role: end
branch:
  from: 1
  label: Yes to all non-AI questions
  steps:
    - text: Document the decision under agency governance and review it if features or use change
      role: end
```

## Where to follow this

```figure
kind: chart
title: Federal instruments are the largest group in the register
alt: "Bar chart of public register records by jurisdiction, with Federal the largest group."
caption: Public register records by jurisdiction. Counts change as records are added.
group: jurisdiction
highlight: federal
```
