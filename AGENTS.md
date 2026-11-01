# Agent Instructions

Before planning or changing this repository, read [specs/context.md](specs/context.md) and follow its layout, ownership, and feature-record rules.

- Treat `specs/` as read-only unless the user explicitly authorizes constitution changes.
- When using plan mode (including built-in planning such as omp), MUST write the approved plan to `features/<feature-name>/plan.md` after user approval and before implementation. A tool-managed plan alone is not sufficient.
- Write the executed plan and validation outcomes to `features/<feature-name>/results.md` only after the work and validation are finished; never use it as an in-progress plan.
- Read [docs/architecture-and-development.md](docs/architecture-and-development.md) for runtime architecture, build scripts, and source/generated-file boundaries.
