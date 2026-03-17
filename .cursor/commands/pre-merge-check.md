---
description: Security audit, stage, commit, and merge current branch into develop
---

Perform the following steps in order. Stop immediately and report if any step fails.

1. **Security scan**: Inspect all staged and unstaged changes (`git diff` and `git diff --cached`) for secrets, API keys, tokens, passwords, credentials, `.env` values, private keys, or any sensitive data that should not be committed. Also check for files that are typically gitignored but may have been accidentally tracked (e.g. `.env`, `GoogleService-Info.plist`, `credentials.json`, `testAccounts.ts`). Report findings and **stop** if anything is found.

2. **Review changes**: Run `git status` to see all modified, added, and untracked files. Flag any build artifacts, local configs, or generated files that shouldn't be committed. Summarize what will be included.

3. **Stage and commit**: If everything looks clean, stage all relevant changes. Draft a concise commit message based on the actual diff content (summarize the "why", not the "what"). Show me the proposed message and commit.

4. **Merge into develop**: After a successful commit, run:
   - `git checkout develop`
   - `git pull origin develop`
   - Merge the feature branch into develop (not a fast-forward: `git merge --no-ff <branch>`)
   - Switch back to the feature branch

   Do **NOT** push to remote. Report the merge result.
