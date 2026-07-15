$ErrorActionPreference = 'Stop'

$MenuKey = 'OpenWithMP3Cutter'
$Extensions = @('.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.wma', '.opus', '.aiff', '.aif')

foreach ($ext in $Extensions) {
  $shellKey = "HKCU:\Software\Classes\SystemFileAssociations\$ext\shell\$MenuKey"
  if (Test-Path $shellKey) {
    Remove-Item -Path $shellKey -Recurse -Force
  }
}

Write-Output 'Menu konteks Open with MP3 Cutter dihapus.'
