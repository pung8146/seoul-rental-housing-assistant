$ErrorActionPreference = 'Stop'

$taskName = 'RentalHousingAssistantCollectNotify'
$wslDistro = $env:RENTAL_HOUSING_WSL_DISTRO
if (-not $wslDistro) {
  $wslDistro = 'Ubuntu'
}

$wslUser = $env:RENTAL_HOUSING_WSL_USER
if (-not $wslUser) {
  $wslUser = 'pung8146'
}

$scriptPath = '/home/pung8146/.openclaw/workspace/apps/rental-housing-assistant/scripts/collect-and-notify.sh'
$arguments = "-d $wslDistro --user $wslUser -- bash -lc `"$scriptPath`""

$action = New-ScheduledTaskAction -Execute 'wsl.exe' -Argument $arguments
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$hourlyTrigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).Date.AddHours(8)) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -StartWhenAvailable

try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logonTrigger, $hourlyTrigger) -Settings $settings -Description '서울 임대주택 어시스턴트 자동 수집 및 텔레그램 알림' -Force | Out-Null
} catch {
  Write-Host "Register-ScheduledTask 실패, schtasks.exe 방식으로 재시도합니다: $($_.Exception.Message)"
  $taskCommand = "wsl.exe $arguments"
  schtasks.exe /Create /TN $taskName /TR $taskCommand /SC HOURLY /MO 1 /ST 00:00 /F | Out-Null

  $startupPath = [Environment]::GetFolderPath('Startup')
  $startupCommandPath = Join-Path $startupPath "$taskName.cmd"
  "@echo off`r`nwsl.exe $arguments`r`n" | Set-Content -Encoding ASCII -Path $startupCommandPath
  Write-Host "로그인 시작 스크립트 등록 완료: $startupCommandPath"
}

Write-Host "작업 스케줄러 등록 완료: $taskName"
Write-Host "수동 실행: Start-ScheduledTask -TaskName $taskName"
