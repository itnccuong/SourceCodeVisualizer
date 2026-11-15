# Feature Map and Boundaries

Use this index to find implementation contracts, not build/install history. [The approved roadmap](../specs/roadmap.md) defines future scope; feature records describe behavior, decisions, validation limits, and implementation details.

## Feature Logic

| Area | Contracts | Implementation records |
| --- | --- | --- |
| Declaration extraction | Syntax-backed headings/bodies; strict range containment; declaration-only versus empty bodies | [Declaration boundaries](../features/declaration-boundaries/results.md), [Group A](../features/phase-one-group-a/results.md) |
| Python provider ranges | Accept comment-only trailing syntax without accepting truncated executable code | [Cached trailing comments](../features/python-cached-trailing-comments/results.md) |
| JavaScript/TypeScript callables | Preserve assigned callable identity and source gaps; handle anonymous callbacks without weakening range guards | [Declaration boundaries](../features/declaration-boundaries/results.md), [Anonymous callbacks](../features/typescript-anonymous-callbacks/results.md) |
| Source navigation | Provider-confirmed types, imported files, decorators, and assignments; immutable UTF-16 source mapping and honest unresolved/ambiguous targets | [Group B](../features/phase-one-group-b/results.md), [Heading navigation](../features/heading-navigation-reveal/results.md) |
| Definition chooser | Declaration/member context, short paths, source preview, exact target selection, and cancellation | [Definition picker](../features/definition-picker/results.md) |
| Canvas geometry | Positive bounded zoom, measured placement, width/height fitting, resize/collapse, and input-cancellable camera reveal | [Group A](../features/phase-one-group-a/results.md), [Interaction follow-up](../features/canvas-interaction-followup/results.md) |
| Scrolling and connections | Body wheel ownership; continuous canvas pan; source anchors remain correct through clipping, scrolling, reflow, and focus changes | [Focused scrolling](../features/focused-body-scrolling/results.md), [Scroll lock release](../features/body-scroll-lock-release/results.md), [Connection focus](../features/connection-focus-restoration/results.md) |
| Graph interaction | Shared-node/cycle-safe selection, movement and recursive close; fit-all, minimap, on-canvas node list, comments | [Groups C/D](../features/phase-one-groups-c-d/results.md), [Drag panning](../features/canvas-drag-pan-restoration/results.md), [Read-only source](../features/read-only-source-gaps/results.md) |
| Canvas persistence | Explicit source-reference JSON, graph/layout restoration, missing-source reporting, and non-destructive format rejection | [Groups C/D](../features/phase-one-groups-c-d/results.md), [Persistence repair](../features/canvas-usability-persistence-repair/results.md), [Source-token restoration](../features/source-token-canvas-load/results.md) |
| File-explorer entry point | Resolve a file into a chosen canvas without conflating file and symbol identity | [Explorer destination](../features/explorer-visualize-destination/results.md) |
| YAML configuration | Mapping/sequence nodes, original source ranges, aliases/anchors, and dedented-sibling boundaries | [YAML support](../features/yaml-language-support/results.md), [Container value boundaries](../features/yaml-container-value-boundaries/results.md) |

## Known Boundaries

- Language support follows the [README support table](../README.MD#language-support-and-parsing); adapter presence is not language parity.
- Language providers find definitions; syntax adapters partition source. Neither proves the actual runtime receiver or executes the analyzed program.
- Some library and stub declarations still fail strict extraction. Better picker metadata does not make unsupported syntax parseable.
- The passive minimap can cover lower-right node controls; automatic camera reveal does not avoid that footprint.
- YAML exploration does not simulate Helm, Kubernetes, or Airflow, and YAML structure is separate from canvas JSON persistence.

## Deferred Work

- **R07:** discover potential concrete implementations beyond interfaces without claiming the actual runtime target.
- **UML:** choose diagram types, notation, and source-to-diagram semantics before implementation.
- **AI-assisted ambiguity:** compare against provider-only analysis and expose uncertainty. Deployment, provider choice, and source-data handling remain undecided; analyzed code must not be executed.
- Additional language support needs explicit per-language syntax and behavior validation.
