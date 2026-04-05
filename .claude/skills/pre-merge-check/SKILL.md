---
name: pre-merge-check
description: Security audit, update docs, commit, publish branch, and merge into develop
disable-model-invocation: true
---

Perform the following steps in order. Stop immediately and report if any step fails.

1. **Security scan**: Inspect all staged and unstaged changes (`git diff` and `git diff --cached`) for secrets, API keys, tokens, passwords, credentials, `.env` values, private keys, or any sensitive data that should not be committed. Also check for files that are typically gitignored but may have been accidentally tracked (e.g. `.env`, `GoogleService-Info.plist`, `credentials.json`, `testAccounts.ts`). Report findings and **stop** if anything is found.

2. **Review changes**: Run `git status` to see all modified, added, and untracked files. Flag any build artifacts, local configs, or generated files that shouldn't be committed. Summarize what will be included.

3. **Update documentation**: Review the branch's changes and determine if any updates are needed to:
   - `CLAUDE.md` — add/update architecture descriptions, conventions, key patterns, or dependencies that were introduced or changed in this branch. Keep the existing style and structure; only add what's new or changed.
   - `.cursor/rules/noomibodi-project.mdc` — same as above, keep in sync with CLAUDE.md.
   - `docs/database_schema.md` — if any new tables, columns, views, RLS policies, or functions were added/modified.
   - `docs/roles.md` — if role behavior changed.
   - Any other relevant docs.

   Make the updates if needed, or report "no doc changes needed" if nothing applies.

4. **Stage and commit**: If everything looks clean, stage all relevant changes (including any doc updates from step 3). Draft a concise commit message based on the actual diff content (summarize the "why", not the "what"). Show me the proposed message and commit.

5. **Publish branch**: If the current branch does not have an upstream remote, push with `-u origin <branch>` to publish it. If it already tracks a remote, push the new commit.

6. **Merge into develop**: After a successful commit and push:
   - `git checkout develop`
   - `git pull origin develop`
   - Merge the feature branch into develop (not a fast-forward: `git merge --no-ff <branch>`)
   - `git push origin develop`
   - Switch back to the feature branch

   Report the merge result.
