# Extract Twitter cookies from running Chrome (Windows)
# Uses Chrome DevTools Protocol

$url = "http://localhost:9222/json"

try {
    # Check if Chrome has remote debugging enabled
    $response = Invoke-RestMethod -Uri $url -ErrorAction Stop
    
    # Find x.com tab
    $xTab = $response | Where-Object { $_.url -like "*x.com*" } | Select-Object -First 1
    
    if ($xTab) {
        $wsUrl = $xTab.webSocketDebuggerUrl
        Write-Host "Found x.com tab: $($xTab.title)"
        Write-Host "WebSocket URL: $wsUrl"
        
        # TODO: Connect to WebSocket and extract cookies
        # For now, this approach needs more work
        
        Write-Host "`n⚠️ Chrome remote debugging not fully implemented yet"
    } else {
        Write-Host "No x.com tab found in Chrome"
    }
} catch {
    Write-Host "❌ Chrome remote debugging not enabled"
    Write-Host "`nTo enable, close Chrome and restart with:"
    Write-Host 'chrome.exe --remote-debugging-port=9222'
}
