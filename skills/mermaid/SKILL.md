---
name: mermaid
description: Help users create clear, accessible, and correct Mermaid diagrams embedded in markdown documents.
---

# Mission

Generate syntax-valid, theme-adaptive, accessible Mermaid diagrams in markdown.

---

# Rules

- **Code Block Syntax:** MUST use ` ```mermaid `. Never use tildes (`~~~`).
- **Label Quoting:** ALWAYS wrap labels in double quotes `A["Label (Details)"]` to prevent parser breaks on special characters or spaces.
- **Line Breaks:** MUST use `<br/>`. Never use `\n`.
- **Node IDs:** 
  - MUST use camelCase without spaces.
  - MUST NOT start with `o` or `x` (triggers unintended edge renderers).
  - MUST NOT use reserved word `end` as node ID (use `End` or `A["end"]`).
- **Edge & Link Syntax:**
  - MUST use universal Mermaid edge syntax:
    - Normal arrow with text: `A -->|"Text"| B`
    - Dotted arrow with text: `A -.->|"Text"| B`
    - Thick arrow with text: `A ==>|"Text"| B`
  - NEVER use non-standard edge symbols such as `-.-X`, `-.-x`, `-- "Text" -->`, or `-. "Text" .->`.
  - NEVER embed unescaped HTML tags, emojis, or special quotes inside pipe delimiters (`|...|`); keep text clean inside double quotes `-->|"Text"|`.
- **Subgraphs:** Max nesting depth ≤ 2-3 levels.
- **Theme & Colors:**
  - **DEFAULT:** STRICTLY NO hardcoded themes (`%%{init: ...}%%`), `style`, `classDef`, `linkStyle`, or inline colors. Keep raw standard syntax for IDE dark/light theme auto-adaptation.
  - **IF USER REQUESTS VIBRANT/CUSTOM COLORS:** ASK user for target IDE theme (Light vs Dark) BEFORE adding styles to ensure contrast.

---

# Supported Diagram Icons

Mermaid Chart supports icon packages in node labels and architecture diagrams:

| Icon Package | Syntax / Prefix Example | Description & Usage |
|---|---|---|
| **Font Awesome** | `fa:fa-user`, `fa:fa-database`, `fa:fa-server` | General UI, database, server, and user icons |
| **AWS Icons** | `aws:ec2`, `aws:s3`, `aws:lambda`, `aws:rds` | Amazon Web Services cloud architecture components |
| **Azure Icons** | `azure:vm`, `azure:storage`, `azure:sql` | Microsoft Azure cloud architecture components |
| **GCP Icons** | `gcp:compute`, `gcp:storage`, `gcp:bigquery` | Google Cloud Platform architecture components |

Usage example: `nodeId["fa:fa-database Database Server"]` or `cloudNode["aws:s3 Storage Bucket"]`.

---

# Execution Workflow

```
1. Select Chart Type (Flowchart | Sequence | Class | State | ERD | Gantt | Mindmap | Architecture | etc.)
2. Determine Flow Direction (TD | LR)
3. Draft Nodes & Edges (Enforce Node ID, Edge Syntax & Quoting rules)
4. Audit Checklist (No themes/styles, valid IDs, standard edges, proper escaping)
5. Output raw ```mermaid block
```

---

# Forbidden Patterns

- ✗ `~~~mermaid` (Use ` ```mermaid `)
- ✗ `A[Text (Detail)]` (Unquoted special characters)
- ✗ `A["Line1\nLine2"]` (Use `<br/>`)
- ✗ `end` as Node ID
- ✗ `oNode` / `xNode` as Node ID
- ✗ `A -- "Label" --> B` or `A -. "Label" .-> B` (Use universal `A -->|"Label"| B` or `A -.->|"Label"| B`)
- ✗ `A -- "Label" -.-X B` or non-standard `-.-X` edge syntax
- ✗ Emojis or unescaped HTML inside pipe delimiters (`|...|`)
- ✗ `%%{init: {'theme': 'dark'}}%%` (Hardcoded themes)
- ✗ Inline `style`, `classDef`, `linkStyle` without explicit user prompt & theme confirmation
- ✗ Relying on colors alone to convey semantics
