# KILN CLI

Knowledge Integration & Lifecycle Network.

`kiln` is the command-line client for creating, validating, packaging, and managing AI-agent packages. Registry behavior is intentionally mocked so the local package architecture can be exercised without network access. Packages use the dedicated `.agent` extension; their `agent.yaml` manifest format is unchanged.

## Usage

```sh
npm install
npm run dev -- search reviewer
npm run dev -- install github-reviewer.agent
npm run dev -- list
```

Create and distribute a local package:

```sh
mkdir github-reviewer && cd github-reviewer
kiln init
kiln validate
kiln pack
kiln install github-reviewer-0.1.0.agent
kiln info github-reviewer
```

Use `kiln inspect <name>` for an installed package or pass an archive/directory. `kiln unpack` validates archive paths during extraction to block Zip Slip attacks. Build the CLI with `npm run build`, then run `kiln --help`.

`kiln run <package>` prepares an installed package and displays its execution plan; it does not call an AI provider. See [the runtime guide](docs/runtime.md) and [manifest specification](docs/spec.md).

Configuration is initialized at `~/.kiln` with `config.json`, `installed.json`, `agents/`, and `cache/`.
