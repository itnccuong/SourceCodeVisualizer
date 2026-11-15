# Dependency security update results

## Goal and acceptance

Update the vulnerable development packages identified in the prepublication dependency audit, remove obsolete dependency paths, preserve runtime parser behavior, and verify installation, audits, linting, integration tests, and packaging. No publication or normal-user extension installation was requested or performed.

## Executed changes

- Replaced legacy `vsce` with `@vscode/vsce` 4.1.1. Replaced duplicate `vscode-test` usage with the maintained `@vscode/test-electron` 3.1.0 for all test-runner APIs.
- Updated ESLint to 10.15.0, `@typescript-eslint/parser` to 8.72.2, Mocha to 12.0.3, glob to 14.0.6, Node types to the 22.x line, and Mocha types to 10.x. Removed the unused ESLint plugin and legacy glob typings.
- Replaced `.eslintrc.json` with `eslint.config.cjs`. The original had no lint rules, so the parser-only policy remains unchanged; the TypeScript compiler checks types.
- Separated compilation from parsing. Development uses TypeScript 5.9.3, while the unchanged runtime parser is pinned to 3.9.10 under npm alias `typescript-parser`. Updated the type-only import and three lazy runtime requires. Release notice collection resolves npm aliases to their actual package metadata.
- Added scoped-purpose overrides: all glob consumers use the direct patched glob release, and minimatch resolves to patched 11.x. Latest parent tools otherwise constrain these dependencies to advisory-affected major versions. Resolved minimatch is 11.0.8; serialize-javascript is 7.1.4.
- Migrated test discovery to glob's promise API and loaded Mocha through its CommonJS entry point.
- Updated the test launcher to use current stable VS Code by default, with optional `VSCODE_EXECUTABLE_PATH` for an existing executable. Test Python/Pylance extensions are isolated under `.vscode-test/extensions`; user data uses a short temporary directory and is removed afterward. Language-extension installation failures propagate.
- Updated both READMEs, `SOURCE.md`, architecture/development documentation, and the changelog with development requirements and the parser/compiler separation. Recommended development runtime: Node.js 24 LTS; Node.js 22.13+ in the supported 22.x line also meets tooling requirements. npm 10+, Python 3, and tar are required.

## Validation actually performed

### Clean install and dependency graph

From `src/vscodeextension`:

```sh
npm install --ignore-scripts
npm ci --ignore-scripts
npm audit
npm audit --omit=dev
npm ls --all --json
```

- Clean installation succeeded without lifecycle scripts.
- Full and production-only audits both reported **0 vulnerabilities**. The earlier full-audit baseline was 33 affected package entries: 1 critical, 19 high, 5 moderate, and 8 low; production was already clear.
- `npm ls --all --json` exited 0 with no dependency problems. `minimist`, `mkdirp`, legacy `vsce`, and `vscode-test` are absent from the resolved graph.
- No `--force`, ignored advisories, audit suppression, or peer-dependency bypass flags were used.
- Intermediate compatibility updates were insufficient: the first upgrade left six advisories after compatible `npm audit fix --ignore-scripts`. Moving to current tooling plus the documented patched glob/minimatch overrides resolved the remaining findings. Intermediate install warnings about removed packages disappeared in the final clean installation.

### Build, lint, and actual integration workflow

```sh
VSCODE_EXECUTABLE_PATH='/Applications/Visual Studio Code.app/Contents/MacOS/Code' npm test
```

- Compiled webview and extension with TypeScript 5.9.3; ESLint 10 passed.
- The maintained test runner launched VS Code **1.146.0 arm64** with the development extension and isolated Python/Pylance installations.
- **207 integration tests passed**. Suites include JavaScript/TypeScript declaration boundaries, Python extraction, YAML outlines, comments, navigation, partitioning, and canvas restoration.
- Final launcher exit code: **0**. Normal-user VS Code extension installations were not modified.
- The first attempt exposed macOS's Unix-socket path limit under the long iCloud repository path. The launcher now uses short temporary user-data paths. A subsequent attempt exposed an incorrect assumption that `require('mocha')` returned a namespace with `.default`; inspecting the installed export established that the CommonJS entry returns the constructor directly. That import was corrected before the successful full run.
- The default stable-download path was not exercised: verification used the existing executable through the documented environment variable. The old VS Code 1.61.1 test target was intentionally removed because current test tooling requires a modern extension host. This does not establish support for the minimum advertised extension engine version.

### Actual packaging and archive inspection

```sh
npm exec --no -- vsce --version
npm run package
```

- The actual packaging CLI reported **4.1.1**.
- Packaging succeeded and generated `src/vscodeextension/release/source-code-visualizer.vsix`: **11,056,383 bytes**, 310 ZIP entries.
- Inspected the archive, rather than relying on manifest classification alone: only the original six runtime npm packages are shipped: Lezer common 1.5.5, Python 1.1.19, LR 1.4.12, highlight 1.2.5; TypeScript 3.9.10; YAML 1.10.3.
- The TypeScript runtime files are under `node_modules/typescript-parser`; the modern development compiler under `node_modules/typescript` is absent. Compiled runtime adapter imports reference the alias.
- ESLint, Mocha, VSCE, test-electron, glob, minimatch, and minimist are not packaged as runtime dependencies.
- All eight original runtime license/notice files match their installed copies byte-for-byte, including the aliased TypeScript package's copyright and third-party notices.
- The corresponding source archive contains current manifests/lockfile, new lint configuration, updated launcher, runtime adapter, and alias-aware release script; no obsolete `.eslintrc.json`, installed dependencies, or test profiles are included. Selected changed source/config files match current originals byte-for-byte.
- Fork identity remains `itnccuong.source-code-visualizer` version 0.2.0. The five packaged README GIF URLs normalize to the intended public HTTPS paths. Original GIFs are not included or re-encoded.

## Decisions and limits

- The security outcome is **zero currently reported npm advisories**, not a guarantee of application security or evidence that a previous vulnerability was exploited.
- No runtime parser algorithm, Python source, CSS colors, or diagram interaction behavior was changed. Parser extraction was exercised by the integration suite after the import-alias migration.
- Vendored highlight.js remains outside npm audit; no new comprehensive vendored-code or webview security review was performed in this dependency task.
- The maintained packager still warns about wildcard activation and recommends bundling for performance. Those are not npm vulnerability findings; activation/bundling behavior was intentionally not changed here.
- Keep the glob/minimatch overrides until upstream constraints admit patched versions, and retest their consumers when removing or changing them.
- Build prerequisites are newer, but the extension's advertised VS Code engine range was not broadened or newly certified. Nothing was pushed, uploaded, or published.
