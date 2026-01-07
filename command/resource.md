---
description: Manage library documentation resources (add, remove, list, update, info, restore)
agent: build
---

Use the resource_manage tool to handle this resource management request.

Parse the user's arguments and call resource_manage with the appropriate parameters:

**User input:** $ARGUMENTS

## Argument Parsing Guide

1. **First word is the action**: add, remove, list, update, info, restore

2. **For `add`:**

   - Format: `add <name> <url> [branch] [notes] [--project]`
   - name: First argument after "add"
   - url: Second argument (the GitHub/Git URL)
   - branch: Optional third argument (default: "main")
   - notes: Optional quoted string for description
   - --project: If present, set project=true

3. **For `remove`, `update`, `info`, `restore`:**
   - Format: `<action> [name]`
   - name is optional for update and restore (operates on all)

## Examples

- `add svelte https://github.com/sveltejs/svelte.dev main "Svelte docs site"`
  -> action: "add", name: "svelte", url: "https://github.com/sveltejs/svelte.dev", branch: "main", notes: "Svelte docs site"

- `add mylib https://github.com/org/mylib --project`
  -> action: "add", name: "mylib", url: "https://github.com/org/mylib", project: true

- `remove svelte`
  -> action: "remove", name: "svelte"

- `list`
  -> action: "list"

- `update`
  -> action: "update" (updates all)

- `update svelte`
  -> action: "update", name: "svelte"

- `info svelte`
  -> action: "info", name: "svelte"

- `restore`
  -> action: "restore" (restores all missing)

- `restore svelte`
  -> action: "restore", name: "svelte"

Now parse "$ARGUMENTS" and call resource_manage with the correct parameters.
