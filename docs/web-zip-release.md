# Web play ZIP release

This release path packages the PC game client as a ZIP for web-based playtest
upload flows. The ZIP root contains `index.html` and all required game assets.

## Build from GitHub Actions

1. Open the repository in GitHub.
2. Go to **Actions**.
3. Select **Build Web Play ZIP**.
4. Run the workflow from the target branch.
5. Download the `stellar-frontier-web-play-zip` artifact.

The artifact contains `stellar-frontier-web.zip`, which is the file to upload to
the web playtest platform.

## Local command

From the repository root:

```bash
npm run package:web:zip
```

The command builds only the PC game client with relative asset paths and writes:

- `apps/pc-client/release/web-zip/stellar-frontier-web/`
- `apps/pc-client/release/web-zip/stellar-frontier-web.zip`

## Package Contract

- `stellar-frontier-web.zip` contains `index.html` at the ZIP root.
- The ZIP also contains the complete `assets/` folder required by the game.
- Editor and mobile companion builds are intentionally excluded.
