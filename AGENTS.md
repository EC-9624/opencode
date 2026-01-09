# Global OpenCode Rules

## Library Documentation Resources

When you need to search, read, or explore library documentation resources, choose the appropriate approach based on complexity:

### Quick Lookups (Call Tools Directly)

For simple questions or quick explanations, call `resource_search`, `resource_read`, `resource_tree` directly:
- "What is X?"
- "Explain Y briefly"
- Quick API lookups

### Deep Research (Delegate to `docs` Subagent)

For thorough research requiring multiple files, comparisons, or detailed explanations with citations, delegate to the `docs` subagent:
- "Explain X in detail with references"
- "Compare X and Y with examples from the docs"
- "Show me all the options/patterns for X"
- When user explicitly asks for citations or references

Example delegation:
```
Task(
  description="Search library docs",
  prompt="Search the recoil resource for useRecoilCallback documentation and explain with examples",
  subagent_type="docs"
)
```

### Admin Tasks (Always Direct)

You may call `resource_manage` directly for administrative tasks:
- `/resource list` - List available resources
- `/resource add` - Add new documentation resources
- `/resource update` - Update existing resources
- `/resource remove` - Remove resources
