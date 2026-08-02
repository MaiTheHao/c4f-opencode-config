---
name: mermaid
description: "Help users create clear, accessible, and correct Mermaid diagrams embedded in markdown documents."
---

# Visualize with Mermaid in Markdown

## Purpose
Help users create clear, accessible, and correct Mermaid diagrams embedded in markdown documents.

## When to Use Mermaid
- Logic with conditional branching
- Critical step order
- Multiple actors/systems involved (multi-system coordination)
- Defining error handling / retry behavior
- Data structure relationships that need to be communicated

## Available Chart Types
- Flowchart
- Swimlanes Diagram
- Sequence Diagram
- Class Diagram
- State Diagram
- Entity Relationship Diagram
- User Journey
- Gantt
- Pie Chart
- Quadrant Chart
- Requirement Diagram
- GitGraph (Git) Diagram
- C4 Diagram
- Mindmaps
- Timeline
- ZenUML
- Sankey
- XY Chart
- Block Diagram
- Packet
- Kanban
- Architecture
- Radar
- Event Modeling
- Treemap
- Venn
- Ishikawa
- Wardley
- Cynefin
- TreeView

## Node Shape Semantics (Flowchart)

| Shape | Syntax | Meaning |
|---|---|---|
| Rectangle | A[Label] | Process step, action |
| Rounded rectangle | A(Label) | Start/End |
| Stadium (pill) | A([Label]) | Terminal point |
| Subroutine | A[[Label]] | Subprocess |
| Cylinder | A[(Label)] | Database, data store |
| Circle | A((Label)) | Event, connector |
| Diamond | A{Label} | Decision, branching |
| Parallelogram | A[/Label/] | Input |
| Parallelogram alt | A[\Label\] | Output |
| Hexagon | A{{Label}} | Prepare / Setup |
| Double circle | A(((Label))) | Stop point |

Rule: Use shapes consistently for the same concept throughout the diagram.

## Syntax Rules (MANDATORY)

### Label Quoting & Special Characters
ALWAYS wrap labels in double quotes, especially when labels contain spaces or special characters (e.g., parentheses):
- Correct: `A["AreaCalculator (Bad Design)"]`
- Incorrect: `A[AreaCalculator (Bad Design)]`

### Code Fence
- Use triple backticks: ```mermaid
- Do not use tildes: ~~~mermaid

### Line Breaks
- Use `<br/>`: `A["Line 1<br/>Line 2"]`
- Do not use `\n`: `A["Line 1\nLine 2"]`

### Node IDs
- Use camelCase, no spaces
- Do not start with "o" or "x" (causes special edge rendering issues)
- Do not use the reserved word "end" as a node ID
- If "end" is needed -> use `A["end"]` or `End`

### Comments
- Use `%%` at the beginning of the line
- Avoid `{}` in comments

### Direction (Flowchart)
- `TD` / `TB`: Top -> Bottom (process, hierarchy)
- `LR`: Left -> Right (timeline, horizontal flow)
- Choose 1 direction consistently

## Accessibility (MANDATORY)

Every diagram MUST have:
- `accTitle: Concise title`
- `accDescr: Detailed description of content for screen readers`

Do not use color alone to convey meaning. Always combine with shape/label.

## Styling & Auto-Theme Optimization (VS Code & GitHub)

### VS Code & GitHub Auto-Theme Optimization Rules
All complex logic processes or structures should be illustrated with Mermaid charts for visual clarity. To ensure diagrams automatically adapt seamlessly to both Light and Dark themes:

- **NEVER hardcode themes** in code blocks (e.g., `%%{init: {'theme': 'dark'}}%%` or YAML `theme:`). Allow the IDE or browser to render according to the active theme dynamically.
- **Adaptive Colors:** Use neutral, pastel color codes with high contrast on both light and dark backgrounds.
- **Do NOT override font color (`color`):** Avoid using `style` or `classDef` to hardcode text colors (`color`). Allow text color to inherit naturally so text never becomes invisible when users toggle themes.
- **Use Styling Correctly:** Only use `style` or `classDef` to adjust border stroke (`stroke`), thickness (`stroke-width`), or light background highlights on critical nodes.
- **Prevent Syntax Errors:** ALWAYS wrap node labels containing special characters in double quotes.
- **Reserved keywords MUST NOT be used as classDef names:** class, graph, end, default, flowchart, sequenceDiagram, stateDiagram, erDiagram, gantt, pie, gitGraph

## Common Pitfalls

| Pitfall | Problem | Solution |
|---|---|---|
| Unquoted special chars | `A[AreaCalculator (Bad Design)]` breaks | Use quotes: `A["AreaCalculator (Bad Design)"]` |
| Hardcoded theme | `%%{init: {'theme': 'dark'}}%%` breaks light theme | DO NOT hardcode theme; let IDE/browser handle auto-theme |
| Hardcoded text color | `color: #fff` in style makes text invisible in light/dark theme | Do not set `color` in `style` or `classDef`; inherit theme text color |
| `end` as node ID | Reserved word conflict | Use `A["end"]` |
| Node ID starts with o/x | `oNode` -> circle edge | Use `orderNode` |
| `\n` in labels | Renders literal \n | Use `<br/>` |
| Color-only meaning | Inaccessible | Combine shape + label |
| Diagram > 25 nodes | Layout degraded, slow | Split into multiple diagrams |
| Forgot direction | Flowchart defaults to TD | Declare explicitly TD/LR |
| Subgraph nesting too deep | Hard to read | Maximum 2-3 levels |

## Workflow for Agent

When user asks to visualize something:

1. **Analyze** — Determine the appropriate diagram type
2. **Generate code** — Create Mermaid syntax following the rules
3. **Validate** — Check against the syntax rules checklist
4. **Render** — Output as a mermaid code block in markdown
5. **Review** — Verify: labels quoted, accTitle/accDescr, node count, shape consistency

## Quality Checklist (Final Gate)

- [ ] Correct diagram type for the data
- [ ] First line is a valid type declaration
- [ ] All labels (especially those with special characters) wrapped in double quotes
- [ ] NO hardcoded themes in code blocks
- [ ] NO hardcoded text `color` in `style` or `classDef`
- [ ] "end" is not used as a node ID
- [ ] Line breaks use `<br/>`, not `\n`
- [ ] Comments use `%%`
- [ ] `accTitle` + `accDescr` are included
- [ ] Node shapes are consistent
- [ ] Node count is 5-15 (split if >25)
- [ ] Labels are 2-5 words, under 40 characters
- [ ] Flow direction is clear (TD or LR)
- [ ] Subgraphs used for grouping (maximum 2-3 levels)
- [ ] classDef names do not clash with reserved keywords
- [ ] Code fence is triple backticks, not tildes
- [ ] Adaptive stroke/fill colors used consistently without forcing text colors

## References
- https://mermaid.js.org/
- https://mermaid.live/
