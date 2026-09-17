$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $projectRoot '.env'

if (Test-Path -LiteralPath $environmentPath) {
    Write-Output '.env already exists. Existing credentials were preserved.'
    exit 0
}

function New-RandomSecret {
    $secretBytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($secretBytes)
        return [BitConverter]::ToString($secretBytes).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $generator.Dispose()
    }
}

$template = Get-Content -LiteralPath (Join-Path $projectRoot '.env.example') -Raw
$databasePassword = New-RandomSecret
$template = $template -replace '(?m)^POSTGRES_PASSWORD=\r?$', "POSTGRES_PASSWORD=$databasePassword"
$template = $template -replace '(?m)^DATABASE_URL=\r?$', "DATABASE_URL=postgresql://blog:${databasePassword}@127.0.0.1:5432/blog"
$template = $template -replace '(?m)^MEILI_MASTER_KEY=\r?$', ('MEILI_MASTER_KEY=' + (New-RandomSecret))
$template = $template -replace '(?m)^BETTER_AUTH_SECRET=\r?$', ('BETTER_AUTH_SECRET=' + (New-RandomSecret))

$encoded = [System.Text.UTF8Encoding]::new($false).GetBytes($template)
$fileStream = [System.IO.File]::Open($environmentPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
try {
    $fileStream.Write($encoded, 0, $encoded.Length)
}
finally {
    $fileStream.Dispose()
}

Write-Output 'Created .env with random local credentials. Secret values were not printed.'
