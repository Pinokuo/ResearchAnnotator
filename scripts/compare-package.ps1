param(
    [Parameter(Mandatory=$true)][string]$ReferenceXPI,
    [Parameter(Mandatory=$true)][string]$CandidateXPI,
    [string]$ReferenceSHA256 = '0ee254179983a77cbd1c784da06b15fd0d5ea4ff437c3acbdc241a379947652e'
)
$ErrorActionPreference = 'Stop'
if ((Get-FileHash -LiteralPath $ReferenceXPI -Algorithm SHA256).Hash -ine $ReferenceSHA256) {
    throw 'Reference package checksum does not match the verified reference'
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$reference = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ReferenceXPI).Path)
$candidate = $null
try {
    $candidate = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $CandidateXPI).Path)
    $allowed = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package-files.json') -Raw | ConvertFrom-Json
    foreach ($archive in @($reference, $candidate)) {
        $names = @($archive.Entries | ForEach-Object FullName)
        if ($names.Count -ne $allowed.Count -or
            @($names | Select-Object -Unique).Count -ne $names.Count -or
            @(Compare-Object $allowed $names -CaseSensitive).Count -ne 0) {
            throw 'Package contains missing, extra, duplicate or incorrectly cased members'
        }
    }
    foreach ($name in $allowed) {
        $hashes = foreach ($archive in @($reference, $candidate)) {
            $stream = $archive.GetEntry($name).Open()
            $sha = [Security.Cryptography.SHA256]::Create()
            try { ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '') }
            finally { $stream.Dispose(); $sha.Dispose() }
        }
        if ($hashes[0] -cne $hashes[1]) { throw "Package member differs: $name" }
    }
    Write-Output "PASS: all $($allowed.Count) member paths and SHA-256 hashes match exactly."
}
finally {
    if ($candidate) { $candidate.Dispose() }
    $reference.Dispose()
}
