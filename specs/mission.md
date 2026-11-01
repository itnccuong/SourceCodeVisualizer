# Project Mission

## Purpose
Evolve the existing Source Code Visualizer VS Code extension with useful, incremental improvements that help developers explore and understand source code through interactive diagrams. Build on the current repository, prioritize Python, and prove improvements locally before preparing for wider distribution.

## Product Focus
- VS Code is the product environment; a standalone web application is not an approved product target.
- Python is the first-priority language. Existing adapters for other languages are not a promise of equal support or reliability.
- Improve the existing extension rather than replace it with an unrelated product or rewrite its stack.

## Development Direction
### Phase 1 — Incremental Improvements and Local Validation
Implement small, immediately actionable improvements to the current extension, with Python as the primary use case. Run and validate the changed behavior locally in VS Code. Use that evidence to prepare a plan for publication to the VS Code Extension Marketplace; publication itself is not an already-completed milestone or an automatic action.

Individual features and their acceptance criteria are selected through dedicated feature planning, not prescribed by this constitution.

### Phase 2 — UML and AI-Assisted Source Analysis
Introduce UML views and AI-assisted analysis of source code beyond the information currently supplied through VS Code language providers. This direction does not require executing the analyzed code or collecting runtime traces. AI-derived relationships and behavior are inferences, not observed execution evidence.

Select UML diagram types during dedicated feature planning. AI providers, local versus cloud deployment, and source-data handling require future planning; this mission approves no particular choice.

### Phase 3 — Additional Languages
Expand attention to languages beyond Python after the Python-first work. Select languages and their support expectations during later planning rather than promise parity across the existing adapters.

## Evidence of Progress
- A Phase 1 improvement delivers its agreed behavior in the locally running extension, with validation recorded before being described as complete.
- Marketplace preparation follows local validation; a successful local run is not evidence of a published release.
- UML and AI-assisted analysis remain future targets until their individual features are designed, implemented, and validated.
- Additional-language support is described according to demonstrated capability rather than adapter presence alone.

## Related Constitution
- [Project context and agent workflow](context.md)
- [Approved technology and constraints](tech.md)
