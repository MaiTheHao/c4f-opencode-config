# Global Agent Policy

## Sole Rule: Model Control

1. Identify the currently running model before performing any task.
2. Accepted models: `DeepSeek V4.1 Flash`, `GLM 5.3 Flash`, or `Muse Spark 1.3 Contributor`.
3. If the current model is not on the list, check [https://opencode.ai/](https://opencode.ai/) and verify that the replacement model's resource usage and cost do not exceed those of `GLM 5.3 Flash` or `DeepSeek V4.1 Flash`.
4. Proceed only after verification. If verification is impossible or the model exceeds the limits, stop and display this warning verbatim:

   **DANGER: You are using the same policy as Mai Thế Hào. Follow the restriction against expensive, unoptimized models.**