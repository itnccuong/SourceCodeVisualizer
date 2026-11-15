# Python cached method boundaries with trailing comments

## Goal and acceptance

Fix `Cannot determine declaration boundaries for "add"` when opening the demo's `OrderReview` class. Keep comments available for hiding/showing, preserve source coordinates and provider ranges, and continue rejecting incomplete executable syntax.

## Cause and executed plan

1. Inspected the real example, Lezer syntax ownership, and actual Pylance document symbols.
2. Pylance excludes the inline comment after `self._orders.append(order)` from `add`'s range, while the cached class AST gives that FunctionDefinition a trailing Comment child. Matching the AST's whitespace-trimmed end against the shorter provider range rejected the otherwise complete method. `label` had the same mismatch.
3. Added a syntax-tail check for cached nodes: skip trailing Comment nodes and descend to the last executable token. Accept only if that token fits the supplied declaration range. Existing source ranges, AST error validation, body extraction, and provider objects remain unchanged.
4. Added LF/CRLF cached-class regressions for `add` and `label`, direct-versus-cached output, provider-range preservation, retained inter-method comments, and rejection of genuinely truncated executable tokens.

## Changes

- `src/vscodeextension/src/outlineproviders/lspextenderpython.ts`
- `src/vscodeextension/src/test/suite/outlineprovider_test/python_declaration_boundaries.test.ts`
- `docs/architecture-and-development.md`
- `src/vscodeextension/CHANGELOG.md`
- `../code-visualizer-demo/README.md`: corrected where provider-excluded inline comments appear and recorded actual class-toggle verification. No example Python source was altered to avoid the bug.

## Observed validation

### Diagnostics and automated checks

- Actual Pylance symbols confirmed that `add` and `label` ended before their inline comments while Lezer's cached method nodes included them.
- Focused Python boundary and comment-visibility suites: **51 passing**, including both new LF/CRLF cases.

### Actual VS Code surface

Used a real VS Code development host with the demo workspace and Python/Pylance enabled.

- Opened actual `orders/order_review.py` as a file node and expanded `OrderReview`.
- All six method rows rendered: `__init__`, `add`, `accepted`, `rejected`, `label`, `report`.
- Clicked the class Comments toggle: **24 visible comment/docstring spans** when shown, **zero** when hidden; all six method rows remained. Inter-method comment blocks compacted.
- Opened actual `add` and `label` nodes through declaration controls. Their source bodies displayed `self._orders.append(order)` and `return "Order review #1"`; the literal hash string remained intact. Screenshot inspected.
- Read-only Python compatibility check: file → `_build_dag` → nested `ingestion_dag` in an actual Airflow source file. Rendered headings, bodies, compact decorator metadata, full tooltip, and declaration navigation remained correct. The file was not executed or modified.

## Decisions and limits

Do not extend a method beyond its provider range or strip comments from source to accommodate caching. Inline comments excluded by Pylance remain in the enclosing class's source gaps, where its Comments toggle controls them. Method nodes retain only their original provider-bounded source. Only focused boundary/comment suites were run, not the full extension suite.
