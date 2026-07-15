$ErrorActionPreference = 'Stop'

$AppDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$MenuKey = 'OpenWithMP3Cutter'
$MenuLabel = 'Open with MP3 Cutter'

$Candidates = @(
  (Join-Path $AppDir 'dist\win-unpacked\MP3 Cutter.exe'),
  (Join-Path $env:LOCALAPPDATA 'Programs\MP3 Cutter\MP3 Cutter.exe'),
  (Join-Path $AppDir 'bin\mp3-cutter.cmd')
)

$Target = $null
foreach ($candidate in $Candidates) {
  if (Test-Path $candidate) {
    $Target = $candidate
    break
  }
}

if (-not $Target) {
  throw 'Executable MP3 Cutter tidak ditemukan. Jalankan npm run build terlebih dahulu.'
}

$Command = "`"$Target`" `"%1`""
$Extensions = @('.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma', '.opus', '.aiff', '.aif')

foreach ($ext in $Extensions) {
  $shellKey = "HKCU:\Software\Classes\SystemFileAssociations\$ext\shell\$MenuKey"
  New-Item -Path $shellKey -Force | Out-Null
  Set-ItemProperty -Path $shellKey -Name '(Default)' -Value $MenuLabel
  Set-ItemProperty -Path $shellKey -Name 'Icon' -Value $Target

  $commandKey = Join-Path $shellKey 'command'
  New-Item -Path $commandKey -Force | Out-Null
  Set-ItemProperty -Path $commandKey -Name '(Default)' -Value $Command
}

Write-Output "Menu konteks terdaftar ke: $Target"
Write-Output "Format: $($Extensions -join ', ')"
Write-Output "Klik kanan file audio -> $MenuLabel"
