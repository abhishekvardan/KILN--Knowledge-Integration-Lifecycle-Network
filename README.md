# AgentHub CLI

`ah` is the AgentHub command-line client. Its registry integration is deliberately mocked, so the command architecture can be exercised without network access. Local packages use the dedicated `.agent` extension (internally ZIP-based, intentionally opaque to users).

## Usage

```sh
npm install
npm run dev -- search reviewer
npm run dev -- install github-reviewer
npm run dev -- list
```

Create and distribute a local package:

```sh
mkdir github-reviewer && cd github-reviewer
npm run dev -- init
npm run dev -- validate
npm run dev -- pack
npm run dev -- install github-reviewer-0.1.0.agent
npm run dev -- info github-reviewer
```

Additional local-package commands include `inspect`, `unpack`, and `lint`. Use `ah inspect <name>` for an installed package or pass an archive/directory. `ah unpack` validates archive paths during extraction to block Zip Slip attacks.

Build and run the compiled CLI with `npm run build` then `npm start -- doctor`.

Configuration is initialized at `~/.agenthub` with `config.json`, `installed.json`, and `agents/`.
