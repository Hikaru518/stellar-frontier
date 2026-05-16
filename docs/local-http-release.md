# Windows local HTTP package

This release path packages the PC game client as static browser files with a
Windows launcher. It is an alternative to the Electron portable exe when a
player's machine blocks or cannot run that exe.

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

## Playtest notes

- The package contains the PC game only; editor and mobile companion builds are
  intentionally excluded.
- The launcher starts a local HTTP server at `http://127.0.0.1:51780/` and then
  opens the default browser.
- Keep the command window open while playing. Closing it stops the local server.
- Browser save data is tied to the local URL, so using the same port is best for
  keeping the same save.
