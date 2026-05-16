# Windows local HTTP package

This release path packages the PC game client as static browser files with a
Windows launcher. It is intended for players who need to run the game locally
through a browser-backed localhost server.

## Build from GitHub Actions

1. Open the repository in GitHub.
2. Go to **Actions**.
3. Select **Build Windows Local HTTP Package**.
4. Run the workflow from the target branch.
5. Download the `stellar-frontier-windows-local-http` artifact.

The downloaded artifact is a zip. Extract it, then double-click
`Start Stellar Frontier.cmd`.

## Local command

From the repository root:

```bash
npm run package:local-http:win
```

The command builds only the PC game client with relative asset paths and writes
the package folder to `apps/pc-client/release/local-http/stellar-frontier-local-http/`.

## Package Contract

- The package includes `Start Stellar Frontier.cmd` and `Start Stellar Frontier.ps1`.
- The game files live under the package `game/` folder.
- Editor and mobile companion builds are intentionally excluded.
