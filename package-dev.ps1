$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$files = @(
    "manifest.json",
    "LICENSE",
    "bootstrap.js",
    "prefs.js",
    "preferences.xhtml",
    "preferences.js",
    "preferences.css",
    "i18n.js",
    "chat.js",
    "citelink.js",
    "review.js",
    "spell.js",
    "spell-live.js",
    "card-fields.js",
    "palette.js",
    "color-mapper.js",
    "data-manager.js",
    "preferences-data.js",
    "infrastructure.js",
    "note-presentation.js",
    "research-notes.js",
    "research-notes-dashboard.js",
    "research-notes.xhtml",
    "research-explorer.js",
    "research-explorer-workspace.js",
    "research-explorer.xhtml",
    "research-chat.js",
    "research-chat-ui.js",
    "research-chat-window.js",
    "research-chat-window-host.js",
    "research-chat-window.xhtml",
    "research-ui.css",
    "research-chat.css",
    "evidence-capture.js",
    "research-network.js",
    "research-network-workspace.js",
    "research-network.xhtml",
    "research-workspace.js",
    "research-workspace-window.js",
    "research-workspace.xhtml",
    "research-workspace.svg",
    "annotation-review.svg",
    "chat.svg",
    "research-settings.svg",
    "icon32.png",
    "icon48.png",
    "icon96.png"
)

Write-Host "`n=== Checking required files ==="

foreach ($file in $files) {
    if (!(Test-Path (Join-Path $root $file) -PathType Leaf)) {
        throw "Missing required file: $file"
    }
}

Write-Host "`n=== Validating manifest ==="

$manifest = Get-Content (Join-Path $root "manifest.json") -Raw |
    ConvertFrom-Json

if ($manifest.name -ne "ResearchAnnotator") {
    throw "Unexpected extension name: $($manifest.name)"
}

if ($manifest.applications.zotero.id -ne "researchannotator@pino") {
    throw "Unexpected add-on ID: $($manifest.applications.zotero.id)"
}

Write-Host "Name and add-on ID are correct."

Write-Host "`n=== Checking JavaScript syntax ==="

$jsFiles = @($files | Where-Object { $_ -match '\.js$' })

foreach ($file in $jsFiles) {
    & node --check (Join-Path $root $file)

    if ($LASTEXITCODE -ne 0) {
        throw "JavaScript syntax check failed: $file"
    }

    Write-Host "OK: $file"
}

Write-Host "`n=== Checking Git diff ==="

& git diff --check

if ($LASTEXITCODE -ne 0) {
    throw "Git diff check failed. Package not created."
}

$buildDir = Join-Path $env:USERPROFILE "Documents\ResearchAnnotatorBuilds"
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$output = Join-Path $buildDir "ResearchAnnotator-dev-$timestamp.xpi"

$tempRoot = Join-Path $env:TEMP (
    "ResearchAnnotatorBuild-" + [guid]::NewGuid().ToString("N")
)

$stage = Join-Path $tempRoot "package"
$verify = Join-Path $tempRoot "verify"

try {
    New-Item -ItemType Directory -Path $stage -Force | Out-Null

    Write-Host "`n=== Copying extension files ==="

    foreach ($file in $files) {
        Copy-Item (Join-Path $root $file) $stage
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem

    Write-Host "`n=== Creating XPI ==="

    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $stage,
        $output,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $false
    )

    Write-Host "`n=== Verifying packaged contents ==="

    [System.IO.Compression.ZipFile]::ExtractToDirectory(
        $output,
        $verify
    )

    foreach ($file in $files) {
        $source = Join-Path $root $file
        $packaged = Join-Path $verify $file

        if (!(Test-Path $packaged -PathType Leaf)) {
            throw "Missing packaged file: $file"
        }

        $sourceHash = (Get-FileHash $source -Algorithm SHA256).Hash
        $packageHash = (Get-FileHash $packaged -Algorithm SHA256).Hash

        if ($sourceHash -ne $packageHash) {
            throw "Packaged file differs from source: $file"
        }
    }

    $packagedManifest = Get-Content (
        Join-Path $verify "manifest.json"
    ) -Raw | ConvertFrom-Json

    if ($packagedManifest.applications.zotero.id -ne "researchannotator@pino") {
        throw "Packaged add-on ID is incorrect."
    }

    Write-Host "`n=== SUCCESS ===" -ForegroundColor Green
    Write-Host "Package: $output"
    Write-Host "All $($files.Count) files verified."
    Write-Host "All JavaScript files passed syntax checks."
    Write-Host "Packaged add-on ID is correct."
}
finally {
    # Verify the absolute target before recursive cleanup; never remove TEMP itself.
    $resolvedTempBase = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd([char[]]"\/")
    $resolvedTempRoot = [System.IO.Path]::GetFullPath($tempRoot)
    $tempParent = [System.IO.Path]::GetDirectoryName($resolvedTempRoot)
    $tempLeaf = [System.IO.Path]::GetFileName($resolvedTempRoot)
    if ($tempParent -ine $resolvedTempBase -or
        $tempLeaf -notmatch '^ResearchAnnotatorBuild-[0-9a-f]{32}$') {
        throw "Refusing temporary cleanup outside the expected build directory: $resolvedTempRoot"
    }
    Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
