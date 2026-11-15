# YAML container value boundaries

## Goal and acceptance

Fix `YAML source mapping failed: child container range is outside the parent interval` when visualizing the demo's `kubernetes/dashboard.yaml`. Preserve the entire multi-document source and deep source navigation; do not change the valid input manifest or relax containment validation.

## Plan as executed

1. The parser's `containers` sequence range included a newline and dedented whitespace before the next `volumes` key, extending beyond the enclosing mapping item. Its semantic `valueRange` ended within the parent.
2. Used CST `valueRange` endpoints, retaining original CRLF offsets, for block/flow mapping container values and block/flow collection items. Kept headings, starts, strict containment/overlap checks, and enclosing source-gap partitioning unchanged.
3. Added a repository-local copy of the reported manifest and LF/CRLF behavioral regressions. Verified exact whole-file reconstruction, deep resources and sibling volumes/mounts, HTML block text, definition/parent navigation, and recursive containment.

## Changed files

- `src/vscodeextension/src/outlineproviders/outlineprovideryaml.ts`
- `src/vscodeextension/src/test/suite/outlineprovider_test/yaml_outline.test.ts`
- `src/vscodeextension/src/test/testfiles/yaml/dashboard.yaml`
- `src/vscodeextension/CHANGELOG.md`
- `docs/architecture-and-development.md`

The sibling demo manifest was not modified.

## Validation

- Targeted YAML provider suite: **11 passing**, including the new LF/CRLF reconstruction, navigation, and containment regressions.
- Actual VS Code development host with the real demo workspace:
  - **Visualize File** rendered all three documents—ConfigMap, Deployment, and Service—including separators.
  - Navigated Deployment `spec` → `template` → pod `spec` → `containers` → `- name: dashboard` → `resources` → `requests`. Requests retained `cpu: 100m` and `memory: 64Mi`; the item retained its name, image, ports, resources, readiness probe, and volume mounts.
  - The requests node's **Show in code** menu selected its original heading. No range error occurred.
- Read-only Python compatibility check: file → `_build_dag` → nested `ingestion_dag` in an actual Airflow source file. Headings, bodies, compact decorator metadata, full tooltip, and navigation remained intact. The file was not executed or modified; no Python extraction code changed.

## Decisions and limits

This fixes parser-trivia ownership rather than clipping invalid ranges, swallowing errors, or special-casing Kubernetes keys. Whitespace and comments outside a value remain in the enclosing source gaps. Only the targeted YAML provider suite was run; no full extension suite was rerun.
