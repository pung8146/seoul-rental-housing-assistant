$ErrorActionPreference = 'Stop'

$taskName = 'RentalHousingAssistantCollectNotify'

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "작업 스케줄러 삭제 완료: $taskName"
} else {
  Write-Host "삭제할 작업이 없습니다: $taskName"
}

$startupCommandPath = Join-Path ([Environment]::GetFolderPath('Startup')) "$taskName.cmd"
if (Test-Path $startupCommandPath) {
  Remove-Item -LiteralPath $startupCommandPath
  Write-Host "로그인 시작 스크립트 삭제 완료: $startupCommandPath"
}
