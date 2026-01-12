# WhatsApp Bot Service Checker
# This script checks if all required services are running

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "WhatsApp Bot Service Checker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check MySQL Service
Write-Host "[1] Checking MySQL Service..." -ForegroundColor Yellow
$mysqlService = Get-Service -Name MySQL* -ErrorAction SilentlyContinue
if ($mysqlService) {
    if ($mysqlService.Status -eq 'Running') {
        Write-Host "   [OK] MySQL is running" -ForegroundColor Green
    } else {
        Write-Host "   [ERROR] MySQL is stopped" -ForegroundColor Red
        Write-Host "   [TIP] Run: Start-Service $($mysqlService.Name)" -ForegroundColor Yellow
    }
} else {
    Write-Host "   [ERROR] MySQL service not found" -ForegroundColor Red
}
Write-Host ""

# Check MySQL Port (3306)
Write-Host "[2] Checking MySQL Port (3306)..." -ForegroundColor Yellow
$mysqlPort = netstat -an | Select-String ":3306"
if ($mysqlPort) {
    Write-Host "   [OK] Port 3306 is listening" -ForegroundColor Green
} else {
    Write-Host "   [ERROR] Port 3306 is not listening" -ForegroundColor Red
}
Write-Host ""

# Check WhatsApp API Port (3000)
Write-Host "[3] Checking WhatsApp API Port (3000)..." -ForegroundColor Yellow
$waPort = netstat -an | Select-String ":3000.*LISTENING"
if ($waPort) {
    Write-Host "   [OK] Port 3000 is listening" -ForegroundColor Green
} else {
    Write-Host "   [ERROR] Port 3000 is not listening" -ForegroundColor Red
    Write-Host "   [TIP] WhatsApp API might not be running" -ForegroundColor Yellow
}
Write-Host ""

# Check Bot Server Port (5000)
Write-Host "[4] Checking Bot Server Port (5000)..." -ForegroundColor Yellow
$botPort = netstat -an | Select-String ":5000.*LISTENING"
if ($botPort) {
    Write-Host "   [OK] Port 5000 is listening" -ForegroundColor Green
} else {
    Write-Host "   [ERROR] Port 5000 is not listening" -ForegroundColor Red
    Write-Host "   [TIP] Bot server might not be running" -ForegroundColor Yellow
}
Write-Host ""

# Test WhatsApp API Connection
Write-Host "[5] Testing WhatsApp API Connection..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "   [OK] WhatsApp API is accessible" -ForegroundColor Green
} catch {
    Write-Host "   [ERROR] Cannot connect to WhatsApp API" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test Bot Server Connection
Write-Host "[6] Testing Bot Server Connection..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000" -TimeoutSec 3 -ErrorAction Stop
    Write-Host "   [OK] Bot server is accessible" -ForegroundColor Green
} catch {
    Write-Host "   [ERROR] Cannot connect to bot server" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Check .env file
Write-Host "[7] Checking .env Configuration..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "   [OK] .env file exists" -ForegroundColor Green
    
    $envContent = Get-Content ".env"
    $dbHost = $envContent | Select-String "DB_HOST="
    $dbName = $envContent | Select-String "DB_NAME="
    $waUrl = $envContent | Select-String "WA_API_URL="
    
    Write-Host "   DB_HOST: $dbHost" -ForegroundColor Cyan
    Write-Host "   DB_NAME: $dbName" -ForegroundColor Cyan
    Write-Host "   WA_API_URL: $waUrl" -ForegroundColor Cyan
} else {
    Write-Host "   [ERROR] .env file not found" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "1. Make sure all services are running" -ForegroundColor White
Write-Host "2. Run: npm start" -ForegroundColor White
Write-Host "3. Check logs for detailed error messages" -ForegroundColor White
Write-Host ""
