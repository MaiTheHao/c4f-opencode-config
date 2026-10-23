---
name: oc-research-tiering
description: "Evidence-tier rubric for research runs: T1/T2/T3 source classification, known-venue list, confidence composition, overclaim checks, and the ResearchReport synthesis schema. Load before classifying any source, assigning claim or overall confidence, judging a citation chain, or formatting a research report."
---

# Evidence Tier Rubric (T1/T2/T3)

Evidence rubric for the research agent family. Load this skill before classifying any source.

## Tier definitions

**T1 — Primary / Peer-Reviewed**
- Peer-reviewed journal or conference paper with DOI, indexed in ACM DL, IEEE Xplore, Scopus, Web of Science, PubMed
- Systematic review / meta-analysis (strongest T1 — prefer over single studies)
- First-party authoritative doc from the org the claim is about (official eng-practices, spec, government statistics agency, SEC filing, central bank data)

**T2 — Practitioner / Credible Secondary**
- Industry case study with disclosed sample size + methodology
- Named-author technical book, recognized publisher (O'Reilly, Manning, Pragmatic)
- Company engineering blog citing data/methodology (not just opinion)
- arXiv/preprint — tag `T2-preprint`; not peer-reviewed, cite with hedge
- Established journalism with editorial standards (Reuters, AP, Bloomberg, WSJ, FT, NYT) — fast-moving facts only
- Community RFC / standards-adjacent doc without formal peer review

**T3 — Anecdotal / Unverified**
- Personal blog, Medium, forum thread (HN/Reddit) with no disclosed method
- Vendor whitepaper / marketing content with commercial interest
- Single non-reproducible demo/benchmark
- Uncredentialed social media claim
- Signal only, never the sole support for a load-bearing claim

## Classification algorithm (first match)

1. DOI present, or venue matches the known-venue list → T1.
2. No DOI, but first-party from the authoritative institution itself → T1.
3. Author credentials + disclosed data/methodology, no peer review → T2.
4. Cannot verify origin or methodology → T3.
5. Ambiguous fit → downgrade one tier, set `TierUncertain: true`.
6. Claim traced through a citation chain with no traceable primary source ("telephone game") → T3, however many secondary sources repeat it. Flag `UNSOURCED-MYTH candidate`.

## Known venues (extend per domain as needed)

- CS/SE: ICSE, FSE/ESEC, ASE, MSR, ISSTA, TSE, TOSEM, EMSE, IST, JSS, CACM, IEEE Computer, IEEE Software
- Medicine: NEJM, Lancet, JAMA, BMJ, Nature Medicine, Cochrane
- General science: Nature, Science, PNAS, PLOS
- Economics: AER, QJE, JPE (NBER working papers = T2, not peer-reviewed)

## Confidence Composition Rule (binding on every role that assigns confidence)

First match wins:

1. `HIGH` — ≥2 independent T1 sources converge.
2. `MEDIUM` — exactly one T1 source, or ≥2 convergent T2 sources.
3. `LOW` — everything else: T3-only, a single T2, non-convergent T2/T3, or conflicting T1.

## Overclaim check

Verify the claim's SCOPE matches the cited source's actual wording (e.g. "often 100x" is not "always 100x"). Mismatch → flag `OVERCLAIM`; cite the source's own hedge/caveat.

## Synthesis schema (`ResearchReport`)

Every orchestrator returns this shape; no material claim may appear outside `Claims`.

- `Question`, `Answer`, `AsOf`
- `Claims`: Array of `{Claim, Sources, Tier, Confidence, Status, CounterEvidence}` where `Status` is `CONFIRMED | CONTRADICTED | UNVERIFIABLE | INFERENCE`
- `Disagreements`, `SourceGaps`, `UnresolvedQuestions`
- `OverallConfidence`: Weakest-Link of the material `Claims`

A claim whose only support is T3 is `UNVERIFIABLE`; an inference is `INFERENCE` and never carries T1/T2 confidence.
