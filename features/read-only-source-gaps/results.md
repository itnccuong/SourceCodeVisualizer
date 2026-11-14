# Read-only source bodies and hidden file gaps

## Goal and acceptance

The user reported visible whitespace-only areas between file declarations, with a caret and unsaved text editing. Remove those empty source boxes and prevent editing of displayed source, without breaking selection, navigation, or comment visibility.

## Plan as executed

1. Inspected source-body construction and comment toggling. Every body started with `contentEditable = true`; showing comments restored that value. Files show comments by default, explaining the file-only symptom. Whitespace-only outline parts were rendered as padded code blocks.
2. Kept source bodies permanently read-only. Recorded whether each block contains only whitespace and hid those blocks both initially and when comments are restored. Preserved source text, rows, and navigation bindings; meaningful source/comment blocks retain their original internal whitespace.
3. Updated the existing comment-toggle contract and added a browser regression for Python/YAML file source bodies, gap layout, repeated toggles, exact source binding, and selection capture.
4. Built a VSIX, verified browser and real VS Code surfaces, installed the package, and updated architecture/changelog documentation.

## Changed files

- `src/web_visualizer/src/vpw/vpw_code_editor.js`
- `src/web_visualizer/tests/canvas_graph_interaction.html`
- `docs/architecture-and-development.md`
- `src/vscodeextension/CHANGELOG.md`

Generated browser outputs and extension media were rebuilt through the normal packaging hook, not edited manually.

## Validation

- `cd src/vscodeextension && npx --no-install vsce package --no-yarn -o ./release/code-visualizer-local.vsix`: build hooks, TypeScript compilation, and packaging passed; 306 files, 9.59 MB.
- Served `src/web_visualizer` on port 8091 and opened `tests/canvas_graph_interaction.html` in Chromium: **24 passed, zero failed**.
- Real VS Code development host, isolated profile `/tmp/scv-file-gap.AC0RkT`, CDP port 9351, built extension sources:
  - Opened the demo repository's actual `helm/values.yaml` through Visualize File.
  - Inspected the screenshot. Four whitespace-only blocks had `display: none`; two meaningful source/comment blocks remained visible. All six bodies were non-editable after hiding and showing comments.
  - Clicked source and sent native keyboard input `UNSAVED_PROBE`. Comparing all source-body text before/after found no change; the probe was absent afterward.
  - Opened the required external Python file `../../MAFC/Workspace/airflow-data/dags/ingestion/table_level/trino_ingestion_dag_factory.py`, without executing or modifying it.
  - Navigated file → `_build_dag(config_path: Path) -> DAG` → nested `ingestion_dag() -> None` through declaration buttons. Inspected actual rendered headings, bodies, compact `@dag(…` metadata, and full decorator tooltip text.
  - Used the Nodes picker to reveal the file and native double-clicks in read-only source to open `CONFIG_DIR` and `SQL_TASK_TIMEOUT`. Their bodies retained `Path(__file__).with_name("config_oracle2iceberg")` and `timedelta(minutes=18)`.
- `/usr/local/bin/code --install-extension src/vscodeextension/release/code-visualizer-local.vsix --force`: reported successful installation.

## Decisions and limits

Read-only applies to every diagram source body, not only YAML/files: none of these edits wrote back to source. Comments still toggle; whitespace-only blocks remain hidden even when comments are shown. Source ranges and model partitioning are unchanged. No extension-host extraction suite was rerun because the implementation change is confined to browser rendering. The isolated VS Code profile showed an existing invalid-interpreter notification, but real Python outline and variable navigation completed. Regular VS Code windows must reload to activate the installed build; previously opened file nodes should be reopened to render the corrected layout.
