# YAML container value boundaries

## Goal and acceptance

Fix `YAML source mapping failed: child container range is outside the parent interval` when visualizing the demo's `kubernetes/dashboard.yaml`. Preserve the entire multi-document source and deep source navigation; do not change the valid input manifest or relax containment validation.

## Plan as executed

1. Inspected the reported source, the YAML provider, and parser CST output. The `containers` sequence's parser `range` ended at offset 1148, including `\n      ` before the next dedented `volumes` key. Its enclosing mapping item ended at 1142. The sequence's semantic `valueRange` ended at 1141.
2. Used CST `valueRange` endpoints, retaining original CRLF offsets, for block/flow mapping container values and block/flow collection items. Kept headings, starts, strict containment/overlap checks, and enclosing source-gap partitioning unchanged.
3. Added a repository-local copy of the reported manifest and LF/CRLF behavioral regressions. Verified exact whole-file reconstruction, deep resources and sibling volumes/mounts, HTML block text, definition/parent navigation, and recursive containment.
4. Built, ran the targeted YAML suite, verified actual VS Code diagrams, updated documentation, packaged and installed the extension.

## Changed files

- `src/vscodeextension/src/outlineproviders/outlineprovideryaml.ts`
- `src/vscodeextension/src/test/suite/outlineprovider_test/yaml_outline.test.ts`
- `src/vscodeextension/src/test/testfiles/yaml/dashboard.yaml`
- `src/vscodeextension/CHANGELOG.md`
- `docs/architecture-and-development.md`

The sibling demo manifest was not modified.

## Validation

- `npm run build:ext`: browser build/media copy and TypeScript compilation passed.
- A temporary Mocha extension-host runner loaded only `out/test/suite/outlineprovider_test/yaml_outline.test.js`, activating the development extension. Launched installed VS Code with `--extensionDevelopmentPath`, `--extensionTestsPath`, an isolated `/tmp/scv-yaml-interval.cmqwwo/test-profile`, and other extensions disabled. **11 passing (1s)**; test runner exit code 0. Both new LF/CRLF cases passed. The temporary runner was deleted afterward.
- Actual VS Code development host on CDP port 9351, profile `/tmp/scv-file-gap.AC0RkT`, using the real demo workspace:
  - Opened actual `kubernetes/dashboard.yaml` using Visualize File. File node rendered all three documents: ConfigMap, Deployment, Service, including separators.
  - Navigated Deployment `spec` → `template` → pod `spec` → `containers` → `- name: dashboard` → `resources` → `requests`. Inspected rendered headings and bodies; requests showed `cpu: 100m` and `memory: 64Mi`. Dashboard item retained its name, nginx image, ports, resources, readinessProbe, and volumeMounts declarations. Screenshot inspected.
  - Used the requests node's real context menu → Show in code. VS Code selected `dashboard.yaml`, **line 39, column 13**, the original requests heading.
  - Used Fit all between late navigation steps to keep controls clear of the minimap input overlay; initial native clicks on the covered item button did not open it. No range error occurred and no overlay behavior was changed in this fix.
  - Python compatibility: opened read-only external `../../MAFC/Workspace/airflow-data/dags/ingestion/table_level/trino_ingestion_dag_factory.py` → `_build_dag(config_path: Path) -> DAG` → nested `ingestion_dag() -> None`. Inspected headings, source bodies, compact `@dag(…` metadata, and full decorator tooltip. The external file was not executed or modified; no Python symbols or extraction code changed.
- `cd src/vscodeextension && npx --no-install vsce package --no-yarn -o ./release/code-visualizer-local.vsix`: build hooks and packaging passed; 306 files, 9.59 MB.
- `/usr/local/bin/code --install-extension src/vscodeextension/release/code-visualizer-local.vsix --force`: reported successful installation.

## Decisions and limits

This fixes parser-trivia ownership rather than clipping invalid ranges, swallowing errors, or special-casing Kubernetes keys. Whitespace and comments outside a value remain in the enclosing source gaps. Only the targeted YAML provider suite was run; no full extension suite was rerun. Reload regular VS Code and recreate the failed file node to use the installed provider.
