---
name: model-routing
description: Use before delegating to a subagent. Gives the fit table (% per role) to pick the model id for worker, reviewer, scout, web research.
---

# Model Routing

Only use the models below. Pick the highest % in the role column. Slot counts and split logic are defined in the primary agent config, not here.

| Model ID | worker (coder, with plan) | reviewer | scout | web research |
|---|---|---|---|---|
| opencode-go/mimo-v2.6-pro | 92% | 85% | 60% | 65% |
| opencode-go/deepseek-v4.1-flash | 82% | 80% | 88% | 72% |
| opencode-go/muse-spark-1.3-contributor | 72% | 90% | 68% | 88% |
| opencode-go/glm-5.3-flash | 65% | 60% | 90% | 62% |

Rule: reviewer model MUST differ from the worker model it reviews (take the next highest reviewer %).
