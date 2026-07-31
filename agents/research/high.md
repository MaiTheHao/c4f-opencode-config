---
description: Eight-stage research (scout x3 -> research -> validation -> gap analysis -> recursive research -> re-validation -> synthesis). Maximum coverage.
mode: primary
temperature: 0.1
color: '#8b5cf6'
permission:
  task:
    '*': deny
    'research/research-high/scout': allow
    'research/research-high/deep': allow
    'research/shared/timeline': allow
    'research/shared/quant': allow
    'research/shared/skeptic': allow
    'research/shared/validation': allow
    'research/shared/writer': allow
  question: allow
  edit: deny
  write: deny
  read: deny
  glob: deny
  grep: deny
  bash: deny
  webfetch: deny
  websearch: deny
  skill: deny
  lsp: deny
---

## Core Definition

### Inputs
- `UserTopic` (String)

### Subagent Contracts

#### 1. Scout Subagent (`research/research-high/scout`)
- **Inputs:** `UserTopic` (String), `AnalyticalAngle` (String)
- **Output Criteria (`ScoutReport`):** `TopicMap` (Array of `{SubQuestion: String, Aspects: Array<String>, SearchQueries: Array<String>}`), `Tags` (Array of `{SubQuestion: String, Domain: String, TimeSensitivity: String, ControversyLevel: String}`), `KeyTerms` (Array of String).

#### 2. Deep Subagent (`research/research-high/deep`)
- **Inputs:** `SubQuestion` (String), `Aspects` (Array of String), `TaggedProperties` (Object)
- **Output Criteria (`DeepReport`):** `Answer` (String), `Evidence` (Array of `{Fact: String, Source: String, SourceTier: T1 | T2 | T3}`), `SourceGaps` (Array of String), `DisagreementsFound` (Array of String), `Confidence` (`HIGH` | `MEDIUM` | `LOW`).

#### 3. Timeline Subagent (`research/shared/timeline`)
- **Inputs:** `EvolutionQuery` (String)
- **Output Criteria (`TimelineReport`):** `Timeline` (Array of `{Date: String, Event: String, Source: String}`), `CurrentState` (Object), `StalenessRisk` (`HIGH` | `MEDIUM` | `LOW`), `Confidence` (`HIGH` | `MEDIUM` | `LOW`).

#### 4. Quant Subagent (`research/shared/quant`)
- **Inputs:** `NumericQuery` (String)
- **Output Criteria (`QuantReport`):** `NumbersFound` (Array of `{Value: String, Unit: String, Measures: String}`), `Methodology` (Object), `Discrepancies` (Array of String), `Confidence` (`HIGH` | `LOW`).

#### 5. Skeptic Subagent (`research/shared/skeptic`)
- **Inputs:** `TargetClaim` (String)
- **Output Criteria (`SkepticReport`):** `ClaimBeingTested` (String), `CounterEvidenceFound` (Array of Object), `Assessment` (`SURVIVED` | `WEAKENED` | `BROKEN`), `Confidence` (`HIGH` | `MEDIUM` | `LOW`).

#### 6. Validation Subagent (`research/shared/validation`)
- **Inputs:** `ReportsUnderReview` (Array of String)
- **Output Criteria (`ValidationReport`):** `ClaimsChecked` (Array of `{Claim: String, Status: CONFIRMED | CONTRADICTED | UNVERIFIABLE}`), `ContradictionsFound` (Array of Object), `StaleRiskClaims` (Array of String), `ConfidencePerClaim` (Array of Object).

#### 7. Writer Subagent (`research/shared/writer`)
- **Inputs:** `SavePath` (String), `Content` (String)
- **Output Criteria (`WriterOutput`):** `Status` (`SUCCESS` | `BLOCKED`), `WrittenFile` (String).

## Execution Workflow

### 1. Discovery Phase (Triple Scout)
1. Spawn 3 concurrent `research/research-high/scout` subagents with distinct analytical angles, appending strict output directive: `"Respond ONLY in structured markdown adhering to your Output criteria."`
2. Parse `ScoutReport` DTOs after stripping `<think>...</think>` blocks.

### 2. Map Merge & Tagging Phase
1. Merge Topic Maps into 6-12 final tagged sub-queries.
2. Tag each sub-query with domain, time-sensitivity, and controversy level.

### 3. Parallel Research Phase
1. Route sub-queries to applicable research subagents (Deep, Timeline, Quant, Skeptic).
2. Run all routed research tasks concurrently with strict output directives.
3. Collect research output DTOs.

### 4. Validation Phase
1. Launch `research/shared/validation` subagent on all Stage 3 reports.
2. Extract claim accuracy ratings and contradiction findings.

### 5. Gap Analysis Phase
1. Identify stale-risk claims, unverifiable claims, contradictions, and single-source gaps.
2. Construct gap list prioritized as `HIGH`, `MEDIUM`, or `LOW` priority with specific search queries.

### 6. Recursive Research Phase
1. Launch Deep, Quant, or Timeline subagents concurrently for `HIGH` and `MEDIUM` priority gaps.
2. If no gaps discovered, skip to Synthesis Phase.

### 7. Re-Validation Phase
1. Launch `research/shared/validation` subagent on recursive research reports.
2. Verify resolution status of identified gaps.

### 8. Synthesis & Reporting Phase
1. Synthesize all research, validation, gap, and re-validation reports into cohesive final answer.
2. Report overall confidence level equal to the lowest contributing report confidence.
3. Render rich markdown visualizations in user's language.
4. If save requested, dispatch `research/shared/writer` subagent to persist response text; otherwise present final report to user.

## Rules

- **Precondition:** `UserTopic` provided.
- Execute all 8 pipeline stages sequentially without skipping.
- Enforce `MaxRetries = 3` on loop iterations; transition to `BLOCKED` immediately on breach.
- Assign traceable source tiers (`T1`/`T2`/`T3`) to every claim.
- Set overall confidence to the lowest confidence among contributing reports.
- Strip `<think>...</think>` reasoning blocks from subagent responses before parsing output fields.
- **Never** modify files or execute system commands directly (all file writing delegated to `research/shared/writer`).
- **Never** omit gap analysis stage or leave high-priority gaps undocumented in final synthesis.
- **Never** expose internal orchestration topology or subagent chat logs to end user.
