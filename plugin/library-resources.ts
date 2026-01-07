import { type Plugin, tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface Resource {
  name: string;
  url: string;
  branch: string;
  notes: string;
  scope: "global" | "project";
  clonedAt: string;
  updatedAt: string;
}

interface ResourceRegistry {
  version: number;
  resources: Resource[];
}

const GLOBAL_RESOURCES_DIR = path.join(
  os.homedir(),
  ".config/opencode/resources"
);
const GLOBAL_REPOS_DIR = path.join(GLOBAL_RESOURCES_DIR, "repos");
const GLOBAL_REGISTRY = path.join(GLOBAL_RESOURCES_DIR, "resources.json");

export const LibraryResourcesPlugin: Plugin = async (ctx) => {
  const PROJECT_RESOURCES_DIR = path.join(ctx.directory, ".opencode/resources");
  const PROJECT_REPOS_DIR = path.join(PROJECT_RESOURCES_DIR, "repos");
  const PROJECT_REGISTRY = path.join(PROJECT_RESOURCES_DIR, "resources.json");

  // Helper: Ensure directory exists
  const ensureDir = (dir: string) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  };

  // Helper: Load registry
  const loadRegistry = (registryPath: string): ResourceRegistry => {
    if (!fs.existsSync(registryPath)) {
      return { version: 1, resources: [] };
    }
    try {
      return JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    } catch {
      return { version: 1, resources: [] };
    }
  };

  // Helper: Save registry
  const saveRegistry = (registryPath: string, registry: ResourceRegistry) => {
    ensureDir(path.dirname(registryPath));
    fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  };

  // Helper: Get merged resources (project overrides global by name)
  const getMergedResources = (): Resource[] => {
    const globalRegistry = loadRegistry(GLOBAL_REGISTRY);
    const projectRegistry = loadRegistry(PROJECT_REGISTRY);

    const merged = new Map<string, Resource>();
    for (const r of globalRegistry.resources) {
      merged.set(r.name, { ...r, scope: "global" });
    }
    for (const r of projectRegistry.resources) {
      merged.set(r.name, { ...r, scope: "project" });
    }
    return Array.from(merged.values());
  };

  // Helper: Get resource path
  const getResourcePath = (resource: Resource): string => {
    return resource.scope === "project"
      ? path.join(PROJECT_REPOS_DIR, resource.name)
      : path.join(GLOBAL_REPOS_DIR, resource.name);
  };

  // Helper: Find resource by name
  const findResource = (name: string): Resource | undefined => {
    return getMergedResources().find((r) => r.name === name);
  };

  return {
    tool: {
      // Main CRUD tool
      resource_manage: tool({
        description: `Manage library documentation resources.

Actions:
- add <name> <url> [branch] [notes] [--project]: Clone and register a resource
- remove <name>: Remove a resource
- list: List all resources (global + project merged)
- update [name]: Pull latest changes (all if no name specified)
- info <name>: Show resource details
- restore [name]: Re-clone missing repos from registry (useful after syncing config to new machine)`,
        args: {
          action: tool.schema.enum([
            "add",
            "remove",
            "list",
            "update",
            "info",
            "restore",
          ]),
          name: tool.schema.string().optional().describe("Resource name"),
          url: tool.schema.string().optional().describe("Git repository URL"),
          branch: tool.schema
            .string()
            .optional()
            .describe("Git branch (default: main)"),
          notes: tool.schema
            .string()
            .optional()
            .describe("Notes about the resource"),
          project: tool.schema
            .boolean()
            .optional()
            .describe("Store in project scope instead of global"),
        },
        async execute(args) {
          const {
            action,
            name,
            url,
            branch = "main",
            notes = "",
            project = false,
          } = args;

          switch (action) {
            case "add": {
              if (!name || !url) {
                return "Error: 'add' requires name and url.\nUsage: add <name> <url> [branch] [notes] [--project]";
              }

              const scope = project ? "project" : "global";
              const reposDir = project ? PROJECT_REPOS_DIR : GLOBAL_REPOS_DIR;
              const registryPath = project ? PROJECT_REGISTRY : GLOBAL_REGISTRY;
              const repoPath = path.join(reposDir, name);

              // Check if already exists
              const existing = findResource(name);
              if (existing) {
                return `Error: Resource '${name}' already exists (${existing.scope}). Remove it first or use a different name.`;
              }

              ensureDir(reposDir);

              // Clone the repository
              try {
                const cloneResult =
                  await ctx.$`git clone --branch ${branch} ${url} ${repoPath}`.quiet();
                if (cloneResult.exitCode !== 0) {
                  return `Error cloning repository: ${cloneResult.stderr}`;
                }
              } catch (err: any) {
                return `Error cloning repository: ${err.message || err}`;
              }

              // Add to registry
              const registry = loadRegistry(registryPath);
              const now = new Date().toISOString();
              registry.resources.push({
                name,
                url,
                branch,
                notes,
                scope,
                clonedAt: now,
                updatedAt: now,
              });
              saveRegistry(registryPath, registry);

              // Get stats
              let fileCount = "unknown";
              let size = "unknown";
              try {
                fileCount = (
                  await ctx.$`find ${repoPath} -type f | wc -l`.text()
                ).trim();
                const sizeResult = await ctx.$`du -sh ${repoPath}`.text();
                size = sizeResult.split("\t")[0];
              } catch {
                // Ignore stat errors
              }

              return `Added '${name}' (${scope})
  URL: ${url}
  Branch: ${branch}
  Notes: ${notes || "(none)"}
  Files: ${fileCount}
  Size: ${size}`;
            }

            case "remove": {
              if (!name) {
                return "Error: 'remove' requires a name.\nUsage: remove <name>";
              }

              const resource = findResource(name);
              if (!resource) {
                return `Error: Resource '${name}' not found.`;
              }

              const registryPath =
                resource.scope === "project"
                  ? PROJECT_REGISTRY
                  : GLOBAL_REGISTRY;
              const repoPath = getResourcePath(resource);

              // Remove directory
              if (fs.existsSync(repoPath)) {
                fs.rmSync(repoPath, { recursive: true });
              }

              // Remove from registry
              const registry = loadRegistry(registryPath);
              registry.resources = registry.resources.filter(
                (r) => r.name !== name
              );
              saveRegistry(registryPath, registry);

              return `Removed '${name}'`;
            }

            case "list": {
              const resources = getMergedResources();
              if (resources.length === 0) {
                return "No resources found.\n\nAdd one with: /resource add <name> <url> [branch] [notes]";
              }

              let output = "Library Resources:\n";
              for (const r of resources) {
                const repoPath = getResourcePath(r);
                const exists = fs.existsSync(repoPath);
                const status = exists ? "" : " [NOT CLONED]";
                output += `\n${r.name} [${r.scope}]${status}`;
                output += `\n  ${r.url} (${r.branch})`;
                if (r.notes) output += `\n  Notes: ${r.notes}`;
                output += `\n  Updated: ${r.updatedAt}`;
              }
              return output;
            }

            case "update": {
              const resources = name
                ? ([findResource(name)].filter(Boolean) as Resource[])
                : getMergedResources();

              if (resources.length === 0) {
                return name
                  ? `Error: Resource '${name}' not found.`
                  : "No resources to update.";
              }

              const results: string[] = [];
              for (const r of resources) {
                const repoPath = getResourcePath(r);

                if (!fs.existsSync(repoPath)) {
                  results.push(
                    `${r.name}: Not cloned (use 'restore' to clone)`
                  );
                  continue;
                }

                try {
                  const pullResult =
                    await ctx.$`git -C ${repoPath} pull`.quiet();

                  if (pullResult.exitCode === 0) {
                    // Update timestamp
                    const registryPath =
                      r.scope === "project"
                        ? PROJECT_REGISTRY
                        : GLOBAL_REGISTRY;
                    const registry = loadRegistry(registryPath);
                    const resource = registry.resources.find(
                      (res) => res.name === r.name
                    );
                    if (resource) {
                      resource.updatedAt = new Date().toISOString();
                      saveRegistry(registryPath, registry);
                    }
                    const output = pullResult.stdout.toString().trim();
                    results.push(
                      `${r.name}: ${output || "Already up to date"}`
                    );
                  } else {
                    results.push(`${r.name}: Error - ${pullResult.stderr}`);
                  }
                } catch (err: any) {
                  results.push(`${r.name}: Error - ${err.message || err}`);
                }
              }
              return results.join("\n");
            }

            case "info": {
              if (!name) {
                return "Error: 'info' requires a name.\nUsage: info <name>";
              }

              const resource = findResource(name);
              if (!resource) {
                return `Error: Resource '${name}' not found.`;
              }

              const repoPath = getResourcePath(resource);
              const exists = fs.existsSync(repoPath);

              let info = `Resource: ${resource.name}
Scope: ${resource.scope}
URL: ${resource.url}
Branch: ${resource.branch}
Notes: ${resource.notes || "(none)"}
Path: ${repoPath}
Cloned: ${resource.clonedAt}
Updated: ${resource.updatedAt}
Status: ${exists ? "Cloned" : "NOT CLONED"}`;

              if (exists) {
                try {
                  const size = (await ctx.$`du -sh ${repoPath}`.text()).split(
                    "\t"
                  )[0];
                  const fileCount = (
                    await ctx.$`find ${repoPath} -type f | wc -l`.text()
                  ).trim();
                  const lastCommit = (
                    await ctx.$`git -C ${repoPath} log -1 --format="%h %s (%cr)"`.text()
                  ).trim();
                  info += `\nSize: ${size}`;
                  info += `\nFiles: ${fileCount}`;
                  info += `\nLast Commit: ${lastCommit}`;
                } catch {
                  // Ignore stat errors
                }
              }

              return info;
            }

            case "restore": {
              const resources = name
                ? ([findResource(name)].filter(Boolean) as Resource[])
                : getMergedResources();

              if (resources.length === 0) {
                return name
                  ? `Error: Resource '${name}' not found in registry.`
                  : "No resources in registry to restore.";
              }

              const results: string[] = [];
              for (const r of resources) {
                const repoPath = getResourcePath(r);

                if (fs.existsSync(repoPath)) {
                  results.push(`${r.name}: Already cloned`);
                  continue;
                }

                const reposDir =
                  r.scope === "project" ? PROJECT_REPOS_DIR : GLOBAL_REPOS_DIR;
                ensureDir(reposDir);

                try {
                  const cloneResult =
                    await ctx.$`git clone --branch ${r.branch} ${r.url} ${repoPath}`.quiet();

                  if (cloneResult.exitCode === 0) {
                    // Update timestamp
                    const registryPath =
                      r.scope === "project"
                        ? PROJECT_REGISTRY
                        : GLOBAL_REGISTRY;
                    const registry = loadRegistry(registryPath);
                    const resource = registry.resources.find(
                      (res) => res.name === r.name
                    );
                    if (resource) {
                      resource.updatedAt = new Date().toISOString();
                      saveRegistry(registryPath, registry);
                    }
                    results.push(`${r.name}: Restored`);
                  } else {
                    results.push(`${r.name}: Error - ${cloneResult.stderr}`);
                  }
                } catch (err: any) {
                  results.push(`${r.name}: Error - ${err.message || err}`);
                }
              }
              return results.join("\n");
            }

            default:
              return `Unknown action: ${action}. Valid actions: add, remove, list, update, info, restore`;
          }
        },
      }),

      // Search tool
      resource_search: tool({
        description: `Search for content within library resources.
If name is omitted, searches all resources.
Returns matching file paths and line snippets.`,
        args: {
          query: tool.schema
            .string()
            .describe("Search pattern (supports regex)"),
          name: tool.schema
            .string()
            .optional()
            .describe("Resource name (optional, searches all if omitted)"),
          include: tool.schema
            .string()
            .optional()
            .describe("File pattern to include (e.g., '*.md', '*.ts')"),
        },
        async execute(args) {
          const { query, name, include } = args;

          const resources = name
            ? ([findResource(name)].filter(Boolean) as Resource[])
            : getMergedResources();

          if (resources.length === 0) {
            return name
              ? `Resource '${name}' not found.`
              : "No resources available.";
          }

          const results: string[] = [];
          for (const r of resources) {
            const repoPath = getResourcePath(r);

            if (!fs.existsSync(repoPath)) {
              continue;
            }

            try {
              const includeFlag = include ? `--include="${include}"` : "";
              const cmd = `grep -r -n -i ${includeFlag} "${query}" "${repoPath}" 2>/dev/null | head -50`;
              const grepResult = await ctx.$`sh -c ${cmd}`.quiet();

              const output = grepResult.stdout.toString().trim();
              if (output) {
                // Make paths relative to resource
                const relativeOutput = output
                  .split("\n")
                  .map((line) => line.replace(repoPath + "/", ""))
                  .join("\n");
                results.push(
                  `\n### ${r.name}\n\`\`\`\n${relativeOutput}\n\`\`\``
                );
              }
            } catch {
              // grep returns exit code 1 if no matches, ignore
            }
          }

          if (results.length === 0) {
            return `No matches found for "${query}"${
              name ? ` in ${name}` : ""
            }`;
          }

          return `Search results for "${query}":${results.join("\n")}`;
        },
      }),

      // Read tool
      resource_read: tool({
        description: "Read a specific file from a library resource",
        args: {
          name: tool.schema.string().describe("Resource name"),
          filePath: tool.schema
            .string()
            .describe(
              "Path to file within the resource (relative to repo root)"
            ),
        },
        async execute(args) {
          const { name, filePath } = args;

          const resource = findResource(name);
          if (!resource) {
            return `Resource '${name}' not found.`;
          }

          const repoPath = getResourcePath(resource);
          if (!fs.existsSync(repoPath)) {
            return `Resource '${name}' is not cloned. Run '/resource restore ${name}' first.`;
          }

          const fullPath = path.join(repoPath, filePath);
          if (!fs.existsSync(fullPath)) {
            return `File not found: ${filePath}\n\nUse resource_tree to see available files.`;
          }

          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            return `'${filePath}' is a directory. Use resource_tree to list its contents.`;
          }

          const content = fs.readFileSync(fullPath, "utf-8");
          return `# ${name}/${filePath}\n\n${content}`;
        },
      }),

      // Tree tool
      resource_tree: tool({
        description: "List files and directories in a library resource",
        args: {
          name: tool.schema.string().describe("Resource name"),
          subpath: tool.schema
            .string()
            .optional()
            .describe("Subdirectory to list (optional)"),
          depth: tool.schema
            .number()
            .optional()
            .describe("Max depth (default: 3)"),
        },
        async execute(args) {
          const { name, subpath = "", depth = 3 } = args;

          const resource = findResource(name);
          if (!resource) {
            return `Resource '${name}' not found.`;
          }

          const repoPath = getResourcePath(resource);
          if (!fs.existsSync(repoPath)) {
            return `Resource '${name}' is not cloned. Run '/resource restore ${name}' first.`;
          }

          const targetPath = path.join(repoPath, subpath);
          if (!fs.existsSync(targetPath)) {
            return `Path not found: ${subpath || "/"}`;
          }

          try {
            const treeResult =
              await ctx.$`find ${targetPath} -maxdepth ${depth} -type f | sort | head -100`.text();

            // Make paths relative to resource
            const lines = treeResult
              .trim()
              .split("\n")
              .filter(Boolean)
              .map((line) => line.replace(repoPath + "/", ""));

            if (lines.length === 0) {
              return `No files found in ${name}/${subpath || ""}`;
            }

            const header = subpath ? `${name}/${subpath}` : name;
            return `Files in ${header} (depth: ${depth}):\n\n${lines.join(
              "\n"
            )}${lines.length >= 100 ? "\n\n(truncated at 100 files)" : ""}`;
          } catch (err: any) {
            return `Error listing files: ${err.message || err}`;
          }
        },
      }),
    },
  };
};
