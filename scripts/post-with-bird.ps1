# Post tweet using bird CLI (Windows PowerShell version)

$TWEET_FILE = Join-Path $PSScriptRoot "..\TWEET-TO-POST-NOW.txt"

if (-not (Test-Path $TWEET_FILE)) {
    Write-Host "No tweet file found"
    exit 1
}

$TWEET_TEXT = Get-Content $TWEET_FILE -Raw

Write-Host "Posting with bird CLI:"
Write-Host $TWEET_TEXT
Write-Host "---"

bird post $TWEET_TEXT

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Tweet posted successfully"
    $log = @{
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        method = "bird_cli"
        status = "posted"
    } | ConvertTo-Json -Compress
    
    Add-Content (Join-Path $PSScriptRoot "..\data\tweets-posted.jsonl") $log
} else {
    Write-Host "❌ Failed to post"
    exit 1
}
