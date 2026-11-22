param([Parameter(Mandatory=$true)][string]$DevelopmentXPI)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest=Get-Content -LiteralPath (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
if($manifest.version -notmatch '^\d+\.\d+\.\d+-beta\.\d+$'){throw 'Expected an explicitly labelled beta version'}
if($manifest.applications.zotero.update_url -notmatch '/updates-beta\.json$'){throw 'Beta must use its dedicated beta feed'}
$feed=Get-Content -LiteralPath (Join-Path $root 'updates-beta.json') -Raw|ConvertFrom-Json
if(@($feed.addons.'researchannotator@pino'.updates).Count -ne 0){throw 'First beta must not advertise unverified automated updates'}
$allowed=[regex]::Matches(([IO.File]::ReadAllText((Join-Path $root 'package-dev.ps1')) -split '\$files = @\(')[1].Split(')')[0],'"([^"\r\n]+)"')|ForEach-Object {$_.Groups[1].Value}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$source=(Resolve-Path -LiteralPath $DevelopmentXPI).Path
$archive=[IO.Compression.ZipFile]::OpenRead($source)
try{
    if($archive.Entries.Count -ne $allowed.Count){throw 'Unexpected package inventory'}
    foreach($entry in $archive.Entries){
        if($entry.FullName -cnotin $allowed){throw 'Non-allowlisted package entry'}
        $stream=$entry.Open();$sha=[Security.Cryptography.SHA256]::Create()
        try{$hash=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','')}finally{$stream.Dispose();$sha.Dispose()}
        if($hash -ne (Get-FileHash -LiteralPath (Join-Path $root $entry.FullName) -Algorithm SHA256).Hash){throw "Source mismatch: $($entry.FullName)"}
    }
}finally{$archive.Dispose()}
$destination=Join-Path (Split-Path -Parent $source) ('ResearchAnnotator-'+$manifest.version+'.xpi')
if(Test-Path -LiteralPath $destination){throw 'Beta candidate already exists; preserve it and choose a new beta version'}
[IO.File]::Copy($source,$destination,$false)
if((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $destination).Hash){throw 'Beta copy differs'}
Write-Output "Verified beta artifact: $destination"
Get-FileHash -LiteralPath $destination -Algorithm SHA256
