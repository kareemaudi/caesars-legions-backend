# Caesar's Legions - Auto Post Tweet via Browser
# This script opens X compose page with tweet pre-filled

param(
    [Parameter(Mandatory=$false)]
    [string]$TweetText = "Day 1 of building Caesar's Legions in public.

$0 MRR → $10K MRR in 90 days.

AI-powered cold email for B2B SaaS founders.

Just finished: Prospect tracking system (scores leads 0-100 based on company size, revenue, pain points).

Next: Find first 10 clients.

Following along? 🏛️"
)

# URL encode the tweet
$EncodedTweet = [System.Web.HttpUtility]::UrlEncode($TweetText)

# X compose URL with pre-filled text
$ComposeUrl = "https://x.com/intent/post?text=$EncodedTweet"

Write-Host "🏛️ Opening X compose page..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Tweet preview:" -ForegroundColor Yellow
Write-Host $TweetText
Write-Host ""
Write-Host "→ Browser will open in 2 seconds..."
Write-Host "→ Just click 'Post' button!"
Write-Host ""

Start-Sleep -Seconds 2

# Open in default browser
Start-Process $ComposeUrl

Write-Host "✓ Compose page opened!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Review the tweet in your browser"
Write-Host "  2. Click the Post button"
Write-Host "  3. Done!"
