param(
    [string]$ResumePath,
    [string]$JobPath
)

$ErrorActionPreference = 'Stop'
$proofprepAnalysis = $null

if ($ResumePath -and $JobPath) {
    $proofprepInput = @{
        resume = Get-Content -Raw -Encoding UTF8 -LiteralPath $ResumePath
        jobDescription = Get-Content -Raw -Encoding UTF8 -LiteralPath $JobPath
    } | ConvertTo-Json
}

if (-not $proofprepInput) {
    throw 'Define $proofprepInput in this terminal first, or supply -ResumePath and -JobPath for your real text files.'
}

try {
    $proofprepAnalysis = Invoke-RestMethod `
        -Uri 'http://127.0.0.1:3001/api/analyze' `
        -Method Post `
        -ContentType 'application/json; charset=utf-8' `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($proofprepInput)) `
        -TimeoutSec 360 `
        -ErrorAction Stop

    $proofprepAnalysis.analysis.requirements |
        Select-Object id, requirement, status |
        Format-Table -AutoSize -Wrap

    $proofprepAnalysis.metrics |
        Select-Object version, model, elapsedMs, modelCalls, cacheHit, unverifiedAssessments |
        Format-List

    # Local diagnostic output only; it can contain personal resume details.
    $proofprepAnalysis | ConvertTo-Json -Depth 15 |
        Set-Content -Encoding UTF8 -LiteralPath '.\proofprep-last-result.json'

    Write-Output 'Full output saved locally to proofprep-last-result.json.'
}
catch {
    if ($_.ErrorDetails.Message) {
        Write-Output $_.ErrorDetails.Message
    }
    elseif ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        try { $reader.ReadToEnd() } finally { $reader.Dispose() }
    }
    else { Write-Output $_.Exception.Message }
}
