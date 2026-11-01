# Project Context and Agent Workflow

Read this file before planning or implementing work in this repository. It defines the agent-related layout; application source remains in `src/` and is not being reorganized.

## Layout and Ownership

```text
project-root/
├── AGENTS.md                  # Entry point directing agents to this context
├── specs/                     # Project constitution; user-directed planning only
│   ├── context.md             # This workflow and ownership contract
│   ├── mission.md             # Why we are building this (future planning session)
│   ├── tech.md                # Approved stack and constraints (future planning session)
│   └── roadmap.md             # High-level feature phases (future planning session)
├── features/                  # Feature-specific development records
│   └── <feature-name>/
│       ├── plan.md            # Approved plan; written after approval, before implementation
│       └── results.md         # Plan as executed and validation; written after completion
├── docs/                      # Research backlog, explanations, and supporting context
│   └── architecture-and-development.md
└── src/                       # Existing application source; unchanged by this layout
```

`features/` is the canonical directory name, not `feature/`. A feature directory groups documentation; it does not automatically create a Git branch or relocate application code.

### specs/: Protected Project Constitution

- Normal implementation, research, review, and planning agents must treat `specs/` as read-only.
- Create or modify constitution files only when the user explicitly requests constitution work or authorizes it in a dedicated planning session.
- This restriction includes `context.md`: do not rewrite these rules as part of ordinary feature work.
- `mission.md`, `tech.md`, and `roadmap.md` are intentionally not created yet. Their contents will be defined with the user in a later planning session; do not create placeholders or infer decisions.
- If a task conflicts with the constitution, report the conflict and obtain the user's direction rather than changing `specs/` to fit the implementation.

### features/: Approved Plans and Completed Results

Use a descriptive lowercase, hyphen-separated feature name, for example `features/canvas-zoom/results.md`.

- Each feature has two distinct records: `features/<feature-name>/plan.md` for its approved plan and `features/<feature-name>/results.md` for completed work.
- **When an agent uses plan mode, it MUST write the approved plan to `features/<feature-name>/plan.md` after user approval and before implementation begins.** This applies to all agents and built-in planning workflows, including omp.
- Before approval, keep draft plans in the conversation or the planning tool's own workspace. Do not create or modify the feature's `plan.md` with an unapproved proposal.
- Approval through a built-in planning workflow counts as approval. A tool-managed plan or transcript alone does not replace the repository's `plan.md`: persist the approved content when returning to a mode that permits repository writes, before implementing.
- The approved plan must include the goal, scope, implementation steps, acceptance criteria, and validation approach. Preserve the substance of the approved plan rather than replacing it with a short summary or a link to an internal planning artifact.
- If an approved plan is revised materially, obtain approval for the revision and update `plan.md` before implementing the revised scope. Keep routine progress in task tools, not as rewrites of the approved plan.
- Agents working without plan mode are not required to create `plan.md` unless requested by the user.
- Planning and implementation agents must not create or modify `results.md` while the feature work is still underway. Do not move feature execution records into `docs/` to bypass this rule.
- After implementation and validation work are finished, create or update `results.md` with both the plan as executed and the observed results.
- If work stops incomplete or blocked, report that state in the conversation; do not write a completion record.
- For subsequent changes to the same feature, leave its existing record untouched until the new work is finished, then update it while preserving relevant prior results.
- The integrating agent owns the final record when multiple agents contribute. Do not have workers independently overwrite it.

A completed feature record should contain:

1. **Goal and acceptance criteria** — what was requested and what completion means.
2. **Plan as executed** — the approach taken, including material changes from the initial plan.
3. **Changes** — behavior delivered and key source files affected.
4. **Validation** — exact commands/scenarios exercised and their observed outcomes; distinguish automated checks from runtime/manual checks.
5. **Limitations and decisions** — known limitations, unverified behavior, and relevant tradeoffs. Never invent a passing result or hide failed checks.

Do not create a `results.md` for this documentation-layout task merely to demonstrate the convention, and do not pre-create example feature directories or templates.

### docs/: Supporting Knowledge

- Store architecture explanations, research notes/backlog, and extra technical context here when requested or required by the work.
- The runtime architecture, package scripts, source components, and generated-file map are documented in [Architecture and Development](../docs/architecture-and-development.md).
- Supporting documents are not a substitute for the approved constitution or completed feature records.
- Normal agents may maintain relevant supporting documentation as part of their assigned work without changing protected specifications.

## Agent Workflow

1. Read this context, any existing constitution files relevant to the task, and the user's current request. Missing future constitution files are not permission to invent their contents.
2. Read relevant technical context in `docs/` and any existing record for the feature.
3. Plan the work in the conversation/task tools. If using plan mode, obtain approval and MUST persist the approved plan to `features/<feature-name>/plan.md` before implementation, including when using built-in planning such as omp. Then implement in the appropriate source files; keep unrelated changes out of scope.
4. Validate the changed behavior and record actual evidence. Architecture-specific source/output boundaries are explained in the development guide.
5. Only after the work and validation are finished, write the feature's `results.md` with the executed plan and outcomes, then link it in the delivery message.

This file governs repository organization and record timing; it does not override system instructions or explicit user direction.
