# `agent.yaml` specification

Required fields are `name`, `version`, and `description`. KILN v0.3 supplies backwards-compatible defaults of `runtime: prompt` and `entrypoint: prompts/system.md` for earlier packages; new packages should state both fields explicitly.

```yaml
name: github-reviewer
version: 1.0.0
description: Reviews pull requests for common issues.
publisher: kiln-examples
author: Example Author
license: MIT
homepage: https://example.com/github-reviewer
repository: https://github.com/example/github-reviewer
keywords: [github, review]
runtime: prompt
entrypoint: prompts/system.md
permissions: [github]
compatibility: { codex: ">=1.0" }
variables: { repository: "" }
dependencies: {}
```

`name` is lowercase kebab-case and `version` is semantic versioning. `publisher`, `author`, `license`, `homepage`, `repository`, `keywords`, and `icon` are optional descriptive metadata. `permissions` lists declared capabilities. `compatibility`, `variables`, and `dependencies` are string maps reserved for runtime and package resolution.
