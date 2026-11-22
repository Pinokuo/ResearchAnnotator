param([string]$Tag='SOURCE_2',[string]$RootURI='',[string]$Probe='native-ui-ux-probe.js')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if(!$RootURI){$RootURI=([Uri]($root+[IO.Path]::DirectorySeparatorChar)).AbsoluteUri}
$location=[IO.File]::ReadAllText((Join-Path $root 'native-workspace-test-location.json'))|ConvertFrom-Json
$profilePath=[IO.Path]::GetFullPath($location.profile)
$fixtureRoot=[IO.Path]::GetDirectoryName($profilePath)
if([IO.Path]::GetFileName($fixtureRoot) -notmatch '^researchannotator-native-workspace-[A-Za-z0-9]+$' -or [IO.Path]::GetFileName($profilePath) -ne 'profile' -or [IO.Path]::GetFullPath($location.addon) -ine (Join-Path $profilePath 'extensions\researchannotator@pino')){throw 'Refusing a non-isolated native test profile'}
$running=Get-CimInstance Win32_Process -Filter "name='zotero.exe'" | Where-Object { $_.CommandLine -match [regex]::Escape($location.profile) }
foreach($process in $running){Stop-Process -Id $process.ProcessId}
$screens=Join-Path $root ('ui-ux-screenshots-'+$Tag.ToLower())
if(Test-Path $screens){throw 'Use a fresh screenshot tag'}
New-Item -ItemType Directory -Path $screens|Out-Null
$report=Join-Path $root ('NATIVE_UI_UX_'+$Tag+'.json')
if(Test-Path $report){throw 'Use a fresh report tag'}
$stage=Join-Path $location.addon 'bootstrap.js'
$unpacked=Test-Path -LiteralPath $location.addon
if($unpacked){[IO.File]::Copy($stage,($stage+'.before-ui-'+$Tag),$false)}
$installedXPI=Join-Path $profilePath 'extensions\researchannotator@pino.xpi'
if(!$unpacked -and !(Test-Path -LiteralPath $installedXPI)){throw 'Installed test add-on unavailable'}
$constants='var UI_UX_ROOT='+($RootURI|ConvertTo-Json -Compress)+',UI_UX_REPORT='+($report|ConvertTo-Json -Compress)+',UI_UX_PREVIOUS='+((Join-Path $root 'NATIVE_GROUNDED_RELEASE_XPI.json')|ConvertTo-Json -Compress)+',UI_UX_SCREENSHOTS='+($screens|ConvertTo-Json -Compress)+';'
$bootstrapText=[IO.File]::ReadAllText((Join-Path $root 'bootstrap.js'))
if($RootURI.StartsWith('jar:file:')){
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $packageURI=[Uri]($RootURI.Substring(4).TrimEnd('!/'))
    $archive=[IO.Compression.ZipFile]::OpenRead($packageURI.LocalPath)
    try{
        $reader=New-Object IO.StreamReader($archive.GetEntry('bootstrap.js').Open())
        try{$packagedBootstrap=$reader.ReadToEnd()}finally{$reader.Dispose()}
        if($packagedBootstrap -cne $bootstrapText){throw 'Packaged bootstrap differs from source'}
        $bootstrapText=$packagedBootstrap
        $reader=New-Object IO.StreamReader($archive.GetEntry('manifest.json').Open())
        try{$packagedManifest=$reader.ReadToEnd()}finally{$reader.Dispose()}
        $manifestStage=Join-Path $location.addon 'manifest.json'
        if($unpacked){[IO.File]::Copy($manifestStage,($manifestStage+'.before-ui-'+$Tag),$false);[IO.File]::WriteAllText($manifestStage,$packagedManifest,(New-Object Text.UTF8Encoding($false)))}
    }finally{$archive.Dispose()}
}
$instrumented=($bootstrapText+"`n"+$constants+"`n"+[IO.File]::ReadAllText((Join-Path $root ('tests/'+$Probe))))
if($unpacked){[IO.File]::WriteAllText($stage,$instrumented,(New-Object Text.UTF8Encoding($false)))}
else{
    if(!$RootURI.StartsWith('jar:file:')){throw 'Use a packaged XPI after native installation'}
    $wrapper=Join-Path $fixtureRoot ('instrumented-'+$Tag+'.xpi')
    [IO.File]::Copy($packageURI.LocalPath,$wrapper,$false)
    $archive=[IO.Compression.ZipFile]::Open($wrapper,[IO.Compression.ZipArchiveMode]::Update)
    try{$archive.GetEntry('bootstrap.js').Delete();$entry=$archive.CreateEntry('bootstrap.js');$writer=New-Object IO.StreamWriter($entry.Open(),(New-Object Text.UTF8Encoding($false)));try{$writer.Write($instrumented)}finally{$writer.Dispose()}}finally{$archive.Dispose()}
    $preserved=Join-Path $fixtureRoot ('installed-before-'+$Tag+'.xpi')
    [IO.File]::Move($installedXPI,$preserved)
    [IO.File]::Copy($wrapper,$installedXPI,$false)
}

Start-Process -FilePath 'C:\Program Files\Zotero\zotero.exe' -ArgumentList @('-no-remote','-purgecaches','-ZoteroDebugText','-profile',('"'+$location.profile+'"')) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $location.dir ('ui-'+$Tag+'-out.txt')) -RedirectStandardError (Join-Path $location.dir ('ui-'+$Tag+'-error.txt')) -PassThru|Select-Object Id
