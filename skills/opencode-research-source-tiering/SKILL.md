---
name: opencode-research-source-tiering
description: Canonical evidence-tier rubric (T1/T2/T3) shared by scout, skeptic, validation subagents.
---

## Tier Definitions

**T1 — Primary / Peer-Reviewed**
- Peer-reviewed journal or conference paper with DOI, indexed in ACM DL, IEEE Xplore, Scopus, Web of Science, PubMed
- Systematic literature review / meta-analysis (strongest T1 — prefer over single studies)
- First-party authoritative doc from the org the claim is ABOUT (e.g. official eng-practices, spec, gov statistics agency, SEC filing, central bank data)

**T2 — Practitioner / Credible Secondary**
- Industry case study with disclosed sample size + methodology
- Named-author technical book, recognized publisher (O'Reilly, Manning, Pragmatic, etc.)
- Company engineering blog that cites data/methodology (not just opinion)
- arXiv / preprint — tag explicitly `T2-preprint` (not peer-reviewed, cite with hedge)
- Established journalism with editorial standards (Reuters, AP, Bloomberg, WSJ, FT, NYT) — for fast-moving facts only
- Community RFC / standards-adjacent doc without formal peer review

**T3 — Anecdotal / Unverified**
- Personal blog, Medium, forum thread (HN/Reddit) with no disclosed method
- Vendor whitepaper / marketing content with commercial interest
- Single non-reproducible demo/benchmark
- Uncredentialed social media claim
- Usable only as a signal. NEVER the sole support for a load-bearing claim.

## Classification Algorithm
1. DOI present, or venue matches known-venue list -> T1.
2. No DOI, but first-party from the authoritative institution itself -> T1.
3. Author credentials + disclosed data/methodology, no peer review -> T2.
4. Cannot verify origin or methodology -> T3.
5. Ambiguous fit -> downgrade one tier, set `TierUncertain: true`.
6. Claim traced through a citation chain with no traceable primary source ("telephone game") -> T3 regardless of how many secondary sources repeat it. Flag `UNSOURCED-MYTH candidate`.

## Known-Venue Reference (extend per domain as needed)
- CS/SE: ICSE, FSE/ESEC, ASE, MSR, ISSTA, TSE, TOSEM, EMSE, IST, JSS, CACM, IEEE Computer, IEEE Software
- Medicine: NEJM, Lancet, JAMA, BMJ, Nature Medicine, Cochrane
- General science: Nature, Science, PNAS, PLOS
- Economics: AER, QJE, JPE (NBER working papers = T2, not peer-reviewed)
- News (T2, facts only): Reuters, AP, Bloomberg, FT, WSJ, NYT

## Confidence Composition Rule (binding on skeptic + validation)
- HIGH: >=2 independent T1 sources converge
- MEDIUM: 1 T1 source alone, OR >=2 convergent T2 sources
- LOW: T2/T3 only, OR T1 sources conflict with each other

## Overclaim Check
When citing a T1 source, verify the claim's SCOPE matches the source's actual wording (e.g. "often 100x" is not "always 100x"). Mismatch -> flag `OVERCLAIM`, cite the source's own hedge/caveat.