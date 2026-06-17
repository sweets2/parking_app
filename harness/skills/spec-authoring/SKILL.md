# Spec Authoring Skill

Use this skill when editing specs/, harness/features.json, or docs/harness-readiness.md.

Every F-46+ spec must include these sections:
- Purpose
- Mode affected
- State fields read
- State fields written
- TypeScript contract signatures
- UI/DOM contract, if touching HTML/CSS/UI
- Behavior
- Acceptance criteria
- Preservation requirements
- Behavior explicitly not implemented
- Non-goals
- Tests / Verification

For F-46+ specs, "Behavior explicitly not implemented" must include:
- no saved-spot flow
- no reminder flow
- no notification flow
- no push flow
- no background monitoring
- no alert mode

Do not hard-fail merely for the words "background" or "monitoring" alone.
Hard-fail for:
- alert
- alerts
- alert mode
- my spot
- saved spot
- save spot
- reminder
- notification
- push
- background monitoring

Exception:
The line is allowed if it also contains one of:
- deprecated
- legacy
- do not implement
- not implemented
- explicitly not implemented
- not supported
- removed

Given/When/Then:
- Required when run_tests is true.
- Not required when run_tests is false.
- HTML/CSS-only specs may use Manual checklist instead.
- Type-only specs may use typecheck-only verification.

Features.json:
- Must remain valid JSON. Do not add comments.
- Add explanatory notes to docs/harness-readiness.md instead.
- Every feature must have id, name, status, order, depends_on, context_files, output_files.
- Every feature should have spec_file.
- Do not use generated_app/ prefixes in output_files.
- Do not include missing docs/prototypes images as required context_files. Use docs/prototypes/PROTOTYPE_NOTES.md as text context.
