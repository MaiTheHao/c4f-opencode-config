---
name: mermaid
description: Help users create clear, accessible, and correct Mermaid diagrams embedded in markdown documents.
---

# Mission

Generate syntax-valid, theme-adaptive, accessible Mermaid diagrams in markdown.

---

# Priority Rules

## P0 Mandatory Constraints

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

## P1 Preferred Constraints

- **Node Count:** Keep 5-15 nodes per diagram. If >25 nodes, split into multiple diagrams.
- **Label Length:** 2-5 words, <40 chars.
- **Direction:** Explicitly set `TD` (top-down) for hierarchy/process or `LR` (left-to-right) for sequence/timeline.
- **Color Independence:** Combine color/style with shape + label (accessibility).
- **Comments:** Use `%%`. Avoid `{}` inside comments.

---

# Flowchart Node Shapes

| Shape | Syntax | Semantics |
|---|---|---|
| Process / Action | `A["Label"]` | Rectangle |
| Start / End | `A("Label")` | Rounded rectangle |
| Terminal | `A(["Label"])` | Stadium / Pill |
| Subprocess | `A[["Label"]]` | Subroutine |
| Database / Store | `A[("Label")]` | Cylinder |
| Event / Connector | `A(("Label"))` | Circle |
| Decision / Branch | `A{"Label"}` | Diamond |
| Input | `A[/"Label"/]` | Parallelogram |
| Output | `A[\"Label"\]` | Parallelogram alt |
| Setup / Prepare | `A{{"Label"}}` | Hexagon |
| Stop | `A((("Label")))` | Double circle |

Rule: Maintain 1:1 shape semantic consistency across single diagram.

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
3. Draft Nodes & Edges (Enforce P0 Node ID, Edge Syntax & Quoting rules)
4. Audit P0 Checklist (No themes/styles, valid IDs, standard edges, proper escaping)
5. Output raw ```mermaid block
```

---

# Decision Rules

- **IF** logic has conditional branching → Use Flowchart (`graph TD` / `graph LR`)
- **IF** multi-actor dynamic interactions → Use Sequence Diagram (`sequenceDiagram`)
- **IF** object structure / inheritance → Use Class Diagram (`classDiagram`)
- **IF** state transitions & events → Use State Diagram (`stateDiagram-v2`)
- **IF** database schemas → Use ER Diagram (`erDiagram`)
- **IF** user explicit request color/vibrant → **THEN** prompt user for IDE theme (Light/Dark) before generating styles
- **IF** diagram node count > 25 → **THEN** split into modular sub-diagrams

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
