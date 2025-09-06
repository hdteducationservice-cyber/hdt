# PowerShell script to add AI support to all HTML files
$publicFolder = "c:\Users\LEO GALAXY\Desktop\realone\public"
$aiSupportScript = "    <!-- AI Support JavaScript -->`n    <script src=`"ai-support.js`"></script>"

# List of HTML files (excluding ones already processed)
$htmlFiles = @(
    "pvideo.html", "QandA.html", "see.html", "sport.html", "sprofile.html", 
    "tprofile.html", "ulogin.html", "uregister.html", "chat.html",
    "adannouncements.html", "adbook.html", "admin.html", "adminlog.html", 
    "adminregister.html", "adpaper.html", "adQandA.html", "adsport.html", 
    "adusers.html", "advideo.html"
)

foreach ($file in $htmlFiles) {
    $filePath = Join-Path $publicFolder $file
    
    if (Test-Path $filePath) {
        Write-Host "Processing $file..."
        
        # Read the file content
        $content = Get-Content $filePath -Raw -Encoding UTF8
        
        # Check if AI support is already added
        if ($content -notmatch "ai-support\.js") {
            # Find the closing body tag and add AI support before it
            if ($content -match "</body>") {
                $newContent = $content -replace "</body>", ($aiSupportScript + "`n</body>")
                
                # Write the updated content back to the file
                Set-Content -Path $filePath -Value $newContent -Encoding UTF8
                Write-Host "Added AI support to $file"
            } else {
                Write-Host "Could not find </body> tag in $file"
            }
        } else {
            Write-Host "AI support already exists in $file"
        }
    } else {
        Write-Host "File not found: $file"
    }
}

Write-Host ""
Write-Host "AI Support Integration Complete!"
Write-Host "The AI chat assistant is now available on all HTML pages."
