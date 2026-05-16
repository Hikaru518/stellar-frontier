import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pcClientDir = path.resolve(scriptDir, "..");
const repoRoot = path.resolve(pcClientDir, "../..");
const releaseRoot = path.resolve(pcClientDir, "release/local-http");
const packageDir = path.resolve(releaseRoot, "stellar-frontier-local-http");
const gameDir = path.resolve(packageDir, "game");

function run(command, args, cwd = repoRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const cmdLauncher = `@echo off
setlocal
cd /d "%~dp0"

where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo PowerShell is required to start the local Stellar Frontier server.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start Stellar Frontier.ps1"
if errorlevel 1 (
  echo.
  echo Failed to start Stellar Frontier.
  pause
  exit /b %errorlevel%
)
`;

const psLauncher = `$ErrorActionPreference = "Stop"

$GameRoot = Join-Path $PSScriptRoot "game"
$IndexPath = Join-Path $GameRoot "index.html"

if (!(Test-Path $IndexPath -PathType Leaf)) {
  Write-Host "Missing game/index.html. Please keep the whole package folder together."
  Read-Host "Press Enter to close"
  exit 1
}

function Send-Text($Context, $StatusCode, $Message) {
  $Bytes = [System.Text.Encoding]::UTF8.GetBytes($Message)
  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = "text/plain; charset=utf-8"
  $Context.Response.ContentLength64 = $Bytes.Length
  $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
  $Context.Response.Close()
}

function Get-ContentType($Path) {
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".css" { return "text/css; charset=utf-8" }
    ".html" { return "text/html; charset=utf-8" }
    ".js" { return "text/javascript; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    ".png" { return "image/png" }
    ".svg" { return "image/svg+xml" }
    ".txt" { return "text/plain; charset=utf-8" }
    ".wasm" { return "application/wasm" }
    ".woff" { return "font/woff" }
    ".woff2" { return "font/woff2" }
    default { return "application/octet-stream" }
  }
}

$Listener = [System.Net.HttpListener]::new()
$Port = 51780
$MaxPort = 51820

while ($true) {
  $Prefix = "http://127.0.0.1:$Port/"
  $Listener.Prefixes.Clear()
  $Listener.Prefixes.Add($Prefix)

  try {
    $Listener.Start()
    break
  } catch {
    if ($Port -ge $MaxPort) {
      Write-Host "Could not start the local server on ports 51780-51820."
      Write-Host $_.Exception.Message
      Read-Host "Press Enter to close"
      exit 1
    }
    $Port += 1
  }
}

$Url = "http://127.0.0.1:$Port/"
Write-Host "Stellar Frontier is running at $Url"
Write-Host "Keep this window open while playing. Close it to stop the local server."
Start-Process $Url

$RootPath = [System.IO.Path]::GetFullPath($GameRoot)
if (!$RootPath.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
  $RootPath = $RootPath + [System.IO.Path]::DirectorySeparatorChar
}

try {
  while ($Listener.IsListening) {
    $Context = $Listener.GetContext()
    $RequestPath = $Context.Request.Url.AbsolutePath

    if ([string]::IsNullOrWhiteSpace($RequestPath) -or $RequestPath -eq "/") {
      $RequestPath = "index.html"
    } else {
      $RequestPath = [System.Uri]::UnescapeDataString($RequestPath.TrimStart("/"))
      $RequestPath = $RequestPath.Replace("/", [System.IO.Path]::DirectorySeparatorChar)
    }

    $FullPath = [System.IO.Path]::GetFullPath((Join-Path $GameRoot $RequestPath))
    if (!$FullPath.StartsWith($RootPath, [System.StringComparison]::OrdinalIgnoreCase)) {
      Send-Text $Context 403 "Forbidden"
      continue
    }

    if (Test-Path $FullPath -PathType Container) {
      $FullPath = Join-Path $FullPath "index.html"
    }

    if (!(Test-Path $FullPath -PathType Leaf)) {
      Send-Text $Context 404 "Not Found"
      continue
    }

    $Bytes = [System.IO.File]::ReadAllBytes($FullPath)
    $Context.Response.StatusCode = 200
    $Context.Response.ContentType = Get-ContentType $FullPath
    $Context.Response.ContentLength64 = $Bytes.Length
    $Context.Response.AddHeader("Cache-Control", "no-store")
    $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
    $Context.Response.Close()
  }
} finally {
  $Listener.Stop()
  $Listener.Close()
}
`;

const readme = `Stellar Frontier local HTTP package
====================================

This package contains only the PC game client.
It does not include the editor or mobile companion app.

How to play on Windows:

1. Keep all files in this folder together.
2. Double-click "Start Stellar Frontier.cmd".
3. A browser should open at http://127.0.0.1:51780/.
4. Keep the command window open while playing.
5. Close the command window to stop the local server.

If port 51780 is already busy, the launcher tries the next available port up to
51820. Save data is stored by the browser for the local URL, so using the same
port is best for keeping the same save.
`;

run(process.execPath, [
  path.resolve(repoRoot, "common/scripts/install-run-rush-pnpm.js"),
  "run",
  "--filter",
  "@stellar-frontier/pc-client",
  "build:local-http",
]);

rmSync(releaseRoot, { recursive: true, force: true });
mkdirSync(gameDir, { recursive: true });
cpSync(path.resolve(pcClientDir, "dist"), gameDir, { recursive: true });

writeFileSync(path.resolve(packageDir, "Start Stellar Frontier.cmd"), cmdLauncher, {
  encoding: "utf8",
  mode: 0o755,
});
writeFileSync(path.resolve(packageDir, "Start Stellar Frontier.ps1"), psLauncher, "utf8");
writeFileSync(path.resolve(packageDir, "README.txt"), readme, "utf8");

console.log(`Local HTTP package written to ${packageDir}`);
