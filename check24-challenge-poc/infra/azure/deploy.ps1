param(
  [Parameter(Mandatory = $false)]
  [string]$ResourceGroupName = "rg-check24-home-core",

  [Parameter(Mandatory = $false)]
  [string]$Location = "westeurope",

  [Parameter(Mandatory = $false)]
  [ValidateLength(2, 12)]
  [string]$NamePrefix = "c24",

  [Parameter(Mandatory = $false)]
  [string]$ImageTag = "latest",

  [Parameter(Mandatory = $false)]
  [string]$IngestKeyTravel = "dev-secret-123",

  [Parameter(Mandatory = $false)]
  [string]$SpeedboatIngestApiKey = "",

  [Parameter(Mandatory = $false)]
  [string]$MongoDbUri = "",

  [Parameter(Mandatory = $false)]
  [string]$JwtSecret = "",

  [Parameter(Mandatory = $false)]
  [string]$DemoUserId = "demo@example.com"
)

$ErrorActionPreference = "Stop"

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command '$Name' not found. Install it and try again."
  }
}

Assert-Command "az"
Assert-Command "npm"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\.." )).Path
$bicepPath = (Join-Path $PSScriptRoot "main.bicep")
$homeCorePath = (Join-Path $repoRoot "services\home-core")
$speedboatPath = (Join-Path $repoRoot "services\speedboat-travel")
$frontendPath = (Join-Path $repoRoot "frontend-web")

Write-Host "Using repo root: $repoRoot"
Write-Host "Deploying to RG '$ResourceGroupName' in '$Location'"

# Ensure resource group exists
az group create --name $ResourceGroupName --location $Location | Out-Null

# Deploy infra
$deploymentName = "home-core-" + (Get-Date -Format "yyyyMMdd-HHmmss")

# Prefer environment variables for secrets to avoid leaking them in shell history.
if ([string]::IsNullOrWhiteSpace($MongoDbUri)) {
  $MongoDbUri = $env:MONGODB_URI
}
if ([string]::IsNullOrWhiteSpace($JwtSecret)) {
  $JwtSecret = $env:JWT_SECRET
}

if ([string]::IsNullOrWhiteSpace($MongoDbUri)) {
  throw "Missing MongoDB connection string. Provide -MongoDbUri or set env var MONGODB_URI."
}
if ([string]::IsNullOrWhiteSpace($JwtSecret)) {
  throw "Missing JWT secret. Provide -JwtSecret or set env var JWT_SECRET."
}

# Use the same per-product ingest key for the demo speedboat unless overridden.
if ([string]::IsNullOrWhiteSpace($SpeedboatIngestApiKey)) {
  $SpeedboatIngestApiKey = $IngestKeyTravel
}

# Use an ARM parameters file to keep quoting stable across shells.
$paramsFile = Join-Path $env:TEMP ("home-core-params-" + $deploymentName + ".json")
$params = @{
  '`$schema'      = 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#'
  contentVersion = '1.0.0.0'
  parameters     = @{
    location             = @{ value = $Location }
    namePrefix           = @{ value = $NamePrefix }
    imageTag             = @{ value = $ImageTag }
    ingestKeyTravel       = @{ value = $IngestKeyTravel }
    speedboatIngestApiKey = @{ value = $SpeedboatIngestApiKey }
    mongoDbUri            = @{ value = $MongoDbUri }
    jwtSecret             = @{ value = $JwtSecret }
    demoUserId             = @{ value = $DemoUserId }
  }
}

$params | ConvertTo-Json -Depth 20 | Set-Content -Path $paramsFile -Encoding utf8

az deployment group create `
  --name $deploymentName `
  --resource-group $ResourceGroupName `
  --template-file $bicepPath `
  --parameters ("@" + $paramsFile) | Out-Null

# Read outputs
$acrName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.acrName.value" -o tsv
$acrLoginServer = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.acrLoginServer.value" -o tsv
$containerAppName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.containerAppName.value" -o tsv
$containerAppUrl = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.containerAppUrl.value" -o tsv
$speedboatAppName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.speedboatContainerAppName.value" -o tsv
$speedboatUrl = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.speedboatUrl.value" -o tsv
$frontendStorageAccountName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.frontendStorageAccountName.value" -o tsv

if ([string]::IsNullOrWhiteSpace($acrName) -or [string]::IsNullOrWhiteSpace($acrLoginServer) -or [string]::IsNullOrWhiteSpace($containerAppName)) {
  throw "Missing deployment outputs; check the deployment in Azure Portal / az output."
}

Write-Host "ACR: $acrName ($acrLoginServer)"
Write-Host "Container App: $containerAppName"
if (-not [string]::IsNullOrWhiteSpace($speedboatAppName)) {
  Write-Host "Speedboat App: $speedboatAppName"
}

# Build + push image (server-side via ACR, no local Docker needed)
$homeImageRef = "$acrLoginServer/home-core:$ImageTag"
$speedboatImageRef = "$acrLoginServer/speedboat-travel:$ImageTag"

Write-Host "Building (ACR build): $homeImageRef"
az acr build --registry $acrName --image "home-core:$ImageTag" $homeCorePath | Out-Null

Write-Host "Building (ACR build): $speedboatImageRef"
az acr build --registry $acrName --image "speedboat-travel:$ImageTag" $speedboatPath | Out-Null

# IMPORTANT:
# Azure Container Apps can keep serving an older image when using a mutable tag like "latest".
# To avoid stale deployments, resolve the tag to the *current digest* and deploy the pinned digest.
function Resolve-AcrDigest {
  param(
    [Parameter(Mandatory = $true)][string]$RegistryName,
    [Parameter(Mandatory = $true)][string]$Repository,
    [Parameter(Mandatory = $true)][string]$Tag
  )

  $manifests = az acr repository show-manifests -n $RegistryName --repository $Repository --top 20 --orderby time_desc -o json | ConvertFrom-Json
  if (-not $manifests) {
    throw "Could not list manifests for $Repository in $RegistryName"
  }

  $match = $manifests | Where-Object { $_.tags -and ($_.tags -contains $Tag) } | Select-Object -First 1
  if (-not $match -or [string]::IsNullOrWhiteSpace($match.digest)) {
    throw "Could not resolve digest for ${Repository}:${Tag} in ${RegistryName}"
  }

  return [string]$match.digest
}

$homeDigest = Resolve-AcrDigest -RegistryName $acrName -Repository 'home-core' -Tag $ImageTag
$speedboatDigest = Resolve-AcrDigest -RegistryName $acrName -Repository 'speedboat-travel' -Tag $ImageTag

$homeImageRefPinned = "$acrLoginServer/home-core@$homeDigest"
$speedboatImageRefPinned = "$acrLoginServer/speedboat-travel@$speedboatDigest"

# Trigger container app to use the image/tag and force a new revision
$deployToken = (Get-Date).ToString('yyyyMMdd-HHmmss')
az containerapp update --name $containerAppName --resource-group $ResourceGroupName --image $homeImageRefPinned --set-env-vars "DEPLOYMENT_TOKEN=$deployToken" | Out-Null

if (-not [string]::IsNullOrWhiteSpace($speedboatAppName)) {
  az containerapp update --name $speedboatAppName --resource-group $ResourceGroupName --image $speedboatImageRefPinned --set-env-vars "DEPLOYMENT_TOKEN=$deployToken" | Out-Null
}

Write-Host "Deployed backend URL: $containerAppUrl"
Write-Host "Health check: $containerAppUrl/health"

try {
  curl.exe --ssl-no-revoke -s -S "$containerAppUrl/health" | Out-Null
}
catch {
  # Don't fail deployment on local SSL revocation checks / curl issues.
}

# --------------------
# Frontend deploy (Azure Storage static website)
# --------------------
if (-not (Test-Path $frontendPath)) {
  throw "Frontend path not found: $frontendPath"
}
if ([string]::IsNullOrWhiteSpace($frontendStorageAccountName)) {
  throw "Missing frontend deployment output (frontendStorageAccountName)."
}

Write-Host "Frontend storage account: $frontendStorageAccountName"

$storageKey = az storage account keys list --account-name $frontendStorageAccountName --resource-group $ResourceGroupName --query "[0].value" -o tsv
if ([string]::IsNullOrWhiteSpace($storageKey)) {
  throw "Could not retrieve storage account key for '$frontendStorageAccountName'."
}

Write-Host "Enabling static website (index.html, 404 -> index.html)"
az storage blob service-properties update --account-name $frontendStorageAccountName --account-key $storageKey --static-website --index-document index.html --404-document index.html | Out-Null

$frontendUrl = az storage account show --name $frontendStorageAccountName --resource-group $ResourceGroupName --query "primaryEndpoints.web" -o tsv
if ([string]::IsNullOrWhiteSpace($frontendUrl)) {
  throw "Could not determine frontend URL (primaryEndpoints.web) for '$frontendStorageAccountName'."
}

Write-Host "Frontend URL: $frontendUrl"

Write-Host "Building frontend (Vite) with VITE_API_BASE_URL=$containerAppUrl and VITE_SPEEDBOAT_URL=$speedboatUrl"
Push-Location $frontendPath
try {
  $env:VITE_API_BASE_URL = $containerAppUrl
  $env:VITE_SPEEDBOAT_URL = $speedboatUrl
  npm install | Out-Null
  npm run build | Out-Null
}
finally {
  Pop-Location
}

$distPath = Join-Path $frontendPath "dist"
if (-not (Test-Path $distPath)) {
  throw "Frontend build output not found: $distPath"
}

Write-Host ("Uploading frontend assets to '{0}' ({1})" -f $frontendStorageAccountName, '$web')
az storage blob upload-batch --account-name $frontendStorageAccountName --account-key $storageKey --destination '$web' --source $distPath --overwrite true | Out-Null

Write-Host "Deployed frontend URL: $frontendUrl"
