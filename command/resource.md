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

Now parse "$ARGUMENTS" and call resource_manage with the correct parameters.
