# Agent Instructions

Before planning or changing this repository, read [specs/context.md](specs/context.md) and follow its layout, ownership, and feature-record rules.

- Treat `specs/` as read-only unless the user explicitly authorizes constitution changes.
- When using plan mode (including built-in planning such as omp), MUST write the approved plan to `features/<feature-name>/plan.md` after user approval and before implementation. A tool-managed plan alone is not sufficient.
- Write the executed plan and validation outcomes to `features/<feature-name>/results.md` only after the work and validation are finished; never use it as an in-progress plan.
- Read [docs/architecture-and-development.md](docs/architecture-and-development.md) for runtime architecture, build scripts, and source/generated-file boundaries.

## Shared Plan Readability
- Use simple terms and short sentences.
- Show decisions with code-like steps, small tables, and input → output examples.
- State what changes and why once; do not repeat the same explanation.
- Keep exact files, APIs, edge cases, and checks so another agent can implement the plan.
- Clearly separate proposed work from tested results.

## Python Runtime Verification
- For every Python-related fix, verify the actual diagram using `../../MAFC/Workspace/airflow-data/dags/ingestion/table_level/trino_ingestion_dag_factory.py`.
- Open two levels deep: file → `_build_dag` → nested `ingestion_dag`. Inspect the rendered headings, decorator metadata, body text, and navigation; automated extraction tests alone are not sufficient.
- Also open the variables or other symbols affected by the fix. Do not execute or modify this external Airflow file.

