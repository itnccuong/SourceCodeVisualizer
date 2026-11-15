# Read-only source bodies and hidden file gaps

## Goal and acceptance

The user reported visible whitespace-only areas between file declarations, with a caret and unsaved text editing. Remove those empty source boxes and prevent editing of displayed source, without breaking selection, navigation, or comment visibility.

## Plan as executed

1. Inspected source-body construction and comment toggling. Every body started with `contentEditable = true`; showing comments restored that value. Files show comments by default, explaining the file-only symptom. Whitespace-only outline parts were rendered as padded code blocks.
2. Kept source bodies permanently read-only. Recorded whether each block contains only whitespace and hid those blocks both initially and when comments are restored. Preserved source text, rows, and navigation bindings; meaningful source/comment blocks retain their original internal whitespace.
3. Updated the existing comment-toggle contract and added a browser regression for Python/YAML file source bodies, gap layout, repeated toggles, exact source binding, and selection capture.

## Changed files

- `src/web_visualizer/src/vpw/vpw_code_editor.js`
- `src/web_visualizer/tests/canvas_graph_interaction.html`
- `docs/architecture-and-development.md`
- `src/vscodeextension/CHANGELOG.md`

## Validation

- Existing `tests/canvas_graph_interaction.html` browser suite in Chromium: **24 passed, zero failed**.
- Real VS Code development host:
  - Opened the demo's actual `helm/values.yaml` through **Visualize File**. Four whitespace-only blocks were hidden and two meaningful source/comment blocks remained visible. All six bodies stayed non-editable after hiding and showing comments.
  - Clicked source and sent native keyboard input. All source-body text remained unchanged.
  - Opened an actual Airflow source file read-only, then navigated file → `_build_dag` → nested `ingestion_dag` through declaration buttons. Headings, bodies, compact decorator metadata, and full tooltip remained correct.
  - Used the Nodes picker to reveal the file and native double-clicks in read-only source to open `CONFIG_DIR` and `SQL_TASK_TIMEOUT`; their complete initializer values remained intact.

## Decisions and limits

Read-only applies to every diagram source body, not only YAML/files; diagram typing does not write back to source. Comments still toggle, and whitespace-only blocks remain hidden even when comments are shown. Source ranges and model partitioning are unchanged. No extension-host extraction suite was rerun because the implementation change is confined to browser rendering.
