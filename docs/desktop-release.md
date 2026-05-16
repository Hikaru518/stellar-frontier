# Windows desktop release

This release path packages the PC client as an unsigned Windows x64 portable exe.
It is intended for playtest distribution through a cloud drive or a GitHub
Actions artifact, not for store distribution.

## Build from GitHub Actions

1. Open the repository in GitHub.
2. Go to **Actions**.
3. Select **Build Windows Desktop Exe**.
4. Run the workflow from the target branch.
5. Download the `stellar-frontier-windows-portable` artifact.

The artifact contains `Stellar Frontier-<version>-portable-x64.exe`.

## Local command

From the repository root:

```bash
npm run package:desktop:win
```

The command builds only the PC game client with relative asset paths, compiles
the Electron main process, and writes the portable exe to
`apps/desktop-client/release/`. It does not package the editor or mobile client.

## Playtest notes

- The exe is unsigned. Windows SmartScreen may warn on first launch.
- The game save stays on the player machine through browser-style app storage.
- The package contains the PC game only; editor and mobile companion builds are
  intentionally excluded.
- This package does not include an installer, auto-update, or code signing.
