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
  [string]$IngestKeyDsl = "dev-secret-123",

  [Parameter(Mandatory = $false)]
  [string]$IngestKeyInsurance = "dev-secret-123",

  [Parameter(Mandatory = $false)]
  [string]$SpeedboatIngestApiKey = "",

  [Parameter(Mandatory = $false)]
  [string]$SpeedboatDslIngestApiKey = "",

  [Parameter(Mandatory = $false)]
  [string]$SpeedboatInsuranceIngestApiKey = "",

  [Parameter(Mandatory = $false)]
  [string]$MongoDbUri = "",

  [Parameter(Mandatory = $false)]
  [string]$JwtSecret = "",

  [Parameter(Mandatory = $false)]
  [string]$DemoUserId = "demo@example.com",

  [Parameter(Mandatory = $false)]
  [string]$OpenRouterApiKey = ""
)

# ==============================================================================
# 1. CONFIGURATION & PREPARATION (Environment Checks)
# ==============================================================================
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
$speedboatDslPath = (Join-Path $repoRoot "services\speedboat-dsl")
$speedboatInsurancePath = (Join-Path $repoRoot "services\speedboat-insurance")
$frontendPath = (Join-Path $repoRoot "frontend-web")
$frontendTravelPath = (Join-Path $repoRoot "frontend-products\travel-web")
$frontendDslPath = (Join-Path $repoRoot "frontend-products\dsl-web")
$frontendInsurancePath = (Join-Path $repoRoot "frontend-products\insurance-web")

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
if ([string]::IsNullOrWhiteSpace($OpenRouterApiKey)) {
  $OpenRouterApiKey = $env:OPENROUTER_API_KEY
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
if ([string]::IsNullOrWhiteSpace($SpeedboatDslIngestApiKey)) {
  $SpeedboatDslIngestApiKey = $IngestKeyDsl
}
if ([string]::IsNullOrWhiteSpace($SpeedboatInsuranceIngestApiKey)) {
  $SpeedboatInsuranceIngestApiKey = $IngestKeyInsurance
}

# ==============================================================================
# 2. INFRASTRUCTURE DEPLOYMENT (Azure Bicep)
# ==============================================================================
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
    ingestKeyDsl          = @{ value = $IngestKeyDsl }
    ingestKeyInsurance    = @{ value = $IngestKeyInsurance }
    speedboatIngestApiKey = @{ value = $SpeedboatIngestApiKey }
    speedboatDslIngestApiKey = @{ value = $SpeedboatDslIngestApiKey }
    speedboatInsuranceIngestApiKey = @{ value = $SpeedboatInsuranceIngestApiKey }
    mongoDbUri            = @{ value = $MongoDbUri }
    jwtSecret             = @{ value = $JwtSecret }
    openRouterApiKey      = @{ value = $OpenRouterApiKey }
    demoUserId             = @{ value = $DemoUserId }
  }
}

$params | ConvertTo-Json -Depth 20 | Set-Content -Path $paramsFile -Encoding utf8

az deployment group create `
  --name $deploymentName `
  --resource-group $ResourceGroupName `
  --template-file $bicepPath `
  --parameters ("@" + $paramsFile) | Out-Null

# ==============================================================================
# 3. OUTPUTS & VARIABLES (Read Results from Azure)
# ==============================================================================
# Read outputs
$acrName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.acrName.value" -o tsv
$acrLoginServer = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.acrLoginServer.value" -o tsv
$containerAppName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.containerAppName.value" -o tsv
$containerAppUrl = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.containerAppUrl.value" -o tsv
$speedboatAppName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.speedboatContainerAppName.value" -o tsv
$speedboatUrl = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.speedboatUrl.value" -o tsv
$speedboatDslAppName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.speedboatDslContainerAppName.value" -o tsv
$speedboatDslUrl = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.speedboatDslUrl.value" -o tsv
$speedboatInsuranceAppName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.speedboatInsuranceContainerAppName.value" -o tsv
$speedboatInsuranceUrl = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.speedboatInsuranceUrl.value" -o tsv

$homeFrontendStorageAccountName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.homeFrontendStorageAccountName.value" -o tsv
$travelFrontendStorageAccountName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.travelFrontendStorageAccountName.value" -o tsv
$dslFrontendStorageAccountName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.dslFrontendStorageAccountName.value" -o tsv
$insuranceFrontendStorageAccountName = az deployment group show --name $deploymentName --resource-group $ResourceGroupName --query "properties.outputs.insuranceFrontendStorageAccountName.value" -o tsv

if ([string]::IsNullOrWhiteSpace($acrName) -or [string]::IsNullOrWhiteSpace($acrLoginServer) -or [string]::IsNullOrWhiteSpace($containerAppName)) {
  throw "Missing deployment outputs; check the deployment in Azure Portal / az output."
}

Write-Host "ACR: $acrName ($acrLoginServer)"
Write-Host "Container App: $containerAppName"
if (-not [string]::IsNullOrWhiteSpace($speedboatAppName)) {
  ==============================================================================
# 4. BACKEND BUILD & DEPLOY (Docker Images -> Azure Container Apps)
# ==============================================================================
# Write-Host "Speedboat App: $speedboatAppName"
}

# Build + push image (server-side via ACR, no local Docker needed)
$homeImageRef = "$acrLoginServer/home-core:$ImageTag"
$speedboatImageRef = "$acrLoginServer/speedboat-travel:$ImageTag"
$speedboatDslImageRef = "$acrLoginServer/speedboat-dsl:$ImageTag"
$speedboatInsuranceImageRef = "$acrLoginServer/speedboat-insurance:$ImageTag"

Write-Host "Building (ACR build): $homeImageRef"
az acr build --registry $acrName --image "home-core:$ImageTag" $homeCorePath | Out-Null

Write-Host "Building (ACR build): $speedboatImageRef"
az acr build --registry $acrName --image "speedboat-travel:$ImageTag" $speedboatPath | Out-Null

Write-Host "Building (ACR build): $speedboatDslImageRef"
az acr build --registry $acrName --image "speedboat-dsl:$ImageTag" $speedboatDslPath | Out-Null

Write-Host "Building (ACR build): $speedboatInsuranceImageRef"
az acr build --registry $acrName --image "speedboat-insurance:$ImageTag" $speedboatInsurancePath | Out-Null

# IMPORTANT: STALE DEPLOYMENT PREVENTION
# Azure Container Apps (ACA) may optimize deployment time by skipping the image pull if the tag (e.g., 'latest')
# is indistinguishable from the currently running version, even if the image content has changed in the registry.
#
# To guarantee that the code we JUST built is the code that actually runs:
# 1. We query the Azure Container Registry (ACR) for the unique SHA256 digest of the build we just pushed.
# 2. We construct a "pinned" image reference (e.g., 'myreg.azurecr.io/image@sha256:abc...').
# 3. We update the Container App with this pinned reference. This forces ACA to recognize a configuration change
#    and spin up a new specific revision with the correct bits.
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
$speedboatDslDigest = Resolve-AcrDigest -RegistryName $acrName -Repository 'speedboat-dsl' -Tag $ImageTag
$speedboatInsuranceDigest = Resolve-AcrDigest -RegistryName $acrName -Repository 'speedboat-insurance' -Tag $ImageTag

$homeImageRefPinned = "$acrLoginServer/home-core@$homeDigest"
$speedboatImageRefPinned = "$acrLoginServer/speedboat-travel@$speedboatDigest"
$speedboatDslImageRefPinned = "$acrLoginServer/speedboat-dsl@$speedboatDslDigest"
$speedboatInsuranceImageRefPinned = "$acrLoginServer/speedboat-insurance@$speedboatInsuranceDigest"

# Trigger container app to use the image/tag and force a new revision
$deployToken = (Get-Date).ToString('yyyyMMdd-HHmmss')
az containerapp update --name $containerAppName --resource-group $ResourceGroupName --image $homeImageRefPinned --set-env-vars "DEPLOYMENT_TOKEN=$deployToken" | Out-Null

if (-not [string]::IsNullOrWhiteSpace($speedboatAppName)) {
  az containerapp update --name $speedboatAppName --resource-group $ResourceGroupName --image $speedboatImageRefPinned --set-env-vars "DEPLOYMENT_TOKEN=$deployToken" | Out-Null
}

if (-not [string]::IsNullOrWhiteSpace($speedboatDslAppName)) {
  az containerapp update --name $speedboatDslAppName --resource-group $ResourceGroupName --image $speedboatDslImageRefPinned --set-env-vars "DEPLOYMENT_TOKEN=$deployToken" | Out-Null
}

if (-not [string]::IsNullOrWhiteSpace($speedboatInsuranceAppName)) {
  az containerapp update --name $speedboatInsuranceAppName --resource-group $ResourceGroupName --image $speedboatInsuranceImageRefPinned --set-env-vars "DEPLOYMENT_TOKEN=$deployToken" | Out-Null
}

Write-Host "Deployed backend URL: $containerAppUrl"
Write-Host "Health check: $containerAppUrl/health"

try {
  curl.exe --ssl-no-revoke -s -S "$containerAppUrl/health" | Out-Null
}
catch {
  ==============================================================================
# 5. FRONTEND DEPLOYMENT (Helper Functions)
# ==============================================================================
# # Don't fail deployment on local SSL revocation checks / curl issues.
}

# --------------------
# Frontend deploys (Azure Storage static websites)
# - Home: frontend-web
# - Products: frontend-products/*
# --------------------
function Get-StorageKey {
  param([Parameter(Mandatory = $true)][string]$AccountName)
  $key = az storage account keys list --account-name $AccountName --resource-group $ResourceGroupName --query "[0].value" -o tsv
  if ([string]::IsNullOrWhiteSpace($key)) {
    throw "Could not retrieve storage account key for '$AccountName'."
  }
  return $key
}

function Enable-StaticWebsite {
  param(
    [Parameter(Mandatory = $true)][string]$AccountName,
    [Parameter(Mandatory = $true)][string]$AccountKey
  )
  az storage blob service-properties update --account-name $AccountName --account-key $AccountKey --static-website --index-document index.html --404-document index.html | Out-Null
}

function Get-StaticWebsiteUrl {
  param([Parameter(Mandatory = $true)][string]$AccountName)
  $url = az storage account show --name $AccountName --resource-group $ResourceGroupName --query "primaryEndpoints.web" -o tsv
  if ([string]::IsNullOrWhiteSpace($url)) {
    throw "Could not determine static website URL (primaryEndpoints.web) for '$AccountName'."
  }
  return $url
}

# follows in last step
function Build-ViteFrontend {
  param(
    [Parameter(Mandatory = $true)][string]$FrontendPath,
    [Parameter(Mandatory = $true)][hashtable]$Env
  )
  if (-not (Test-Path $FrontendPath)) {
    throw "Frontend path not found: $FrontendPath"
  }
  Push-Location $FrontendPath
  try {
    foreach ($k in $Env.Keys) {
	  # PowerShell doesn't support dynamic env var assignment via $env:$k.
	  # Use the Env: drive instead.
	  Set-Item -Path ("Env:" + [string]$k) -Value ([string]$Env[$k])
    }
    npm install | Out-Null
    npm run build | Out-Null
  }
  finally {
    Pop-Location
  }
}

# follow/executed as final last step
function Upload-StaticSite {
  param(
    [Parameter(Mandatory = $true)][string]$AccountName,
    [Parameter(Mandatory = $true)][string]$AccountKey,
    [Parameter(Mandatory = $true)][string]$DistPath
  )
  if (-not (Test-Path $DistPath)) {
    throw "Frontend build output not found: $DistPath"
  }
  az storage blob upload-batch --account-name $AccountName --account-key $AccountKey --destination '$web' --source $DistPath --overwrite true | Out-Null
}

if ([string]::IsNullOrWhiteSpace($homeFrontendStorageAccountName) -or
    [string]::IsNullOrWhiteSpace($travelFrontendStorageAccountName) -or
    [string]::IsNullOrWhiteSpace($dslFrontendStorageAccountName) -or
    [string]::IsNullOrWhiteSpace($insuranceFrontendStorageAccountName)) {
  throw "Missing one or more frontend storage account outputs; check the Bicep deployment outputs."
}


# 1. Retrieve access keys for all storage accounts
$homeStorageKey = Get-StorageKey -AccountName $homeFrontendStorageAccountName
$travelStorageKey = Get-StorageKey -AccountName $travelFrontendStorageAccountName
$dslStorageKey = Get-StorageKey -AccountName $dslFrontendStorageAccountName
$insuranceStorageKey = Get-StorageKey -AccountName $insuranceFrontendStorageAccountName

Write-Host "Enabling static websites (index.html, 404 -> index.html)"
# 2. Configure storage accounts as static web servers (SPA routing)
Enable-StaticWebsite -AccountName $homeFrontendStorageAccountName -AccountKey $homeStorageKey
Enable-StaticWebsite -AccountName $travelFrontendStorageAccountName -AccountKey $travelStorageKey
Enable-StaticWebsite -AccountName $dslFrontendStorageAccountName -AccountKey $dslStorageKey
Enable-StaticWebsite -AccountName $insuranceFrontendStorageAccountName -AccountKey $insuranceStorageKey

# 3. Retrieve the public HTTP URLs for the hosted sites
$homeFrontendUrl = Get-StaticWebsiteUrl -AccountName $homeFrontendStorageAccountName
$travelFrontendUrl = Get-StaticWebsiteUrl -AccountName $travelFrontendStorageAccountName
$dslFrontendUrl = Get-StaticWebsiteUrl -AccountName $dslFrontendStorageAccountName
$insuranceFrontendUrl = Get-StaticWebsiteUrl -AccountName $insuranceFrontendStorageAccountName



==============================================================================
# 6. LINKING & FINALIZATION (Inject URLs & Build Code)
# ==============================================================================
# This phase resolves the "Chicken & Egg" problem:
# - Backends need to know valid Frontend URLs (for redirects/CORS)
# - Frontends need to know valid Backend URLs (for API calls)

Write-Host "Home frontend URL: $homeFrontendUrl"
Write-Host "Travel frontend URL: $travelFrontendUrl"
Write-Host "DSL frontend URL: $dslFrontendUrl"
Write-Host "Insurance frontend URL: $insuranceFrontendUrl"

# A. UPDATE BACKENDS: Inject the now-known Frontend URLs into Container Apps
#    This allows the backend to generate valid deep links or configure CORS properly.
az containerapp update --name $containerAppName --resource-group $ResourceGroupName --set-env-vars "TRAVEL_WEB_URL=$travelFrontendUrl" "DSL_WEB_URL=$dslFrontendUrl" "INSURANCE_WEB_URL=$insuranceFrontendUrl" "DEPLOYMENT_TOKEN=$deployToken" | Out-Null

if (-not [string]::IsNullOrWhiteSpace($speedboatAppName)) {
  az containerapp update --name $speedboatAppName --resource-group $ResourceGroupName --set-env-vars "PRODUCT_WEB_URL=$travelFrontendUrl" "DEPLOYMENT_TOKEN=$deployToken" | Out-Null
}
if (-not [string]::IsNullOrWhiteSpace($speedboatDslAppName)) {
  az containerapp update --name $speedboatDslAppName --resource-group $ResourceGroupName --set-env-vars "PRODUCT_WEB_URL=$dslFrontendUrl" "DEPLOYMENT_TOKEN=$deployToken" | Out-Null
}
if (-not [string]::IsNullOrWhiteSpace($speedboatInsuranceAppName)) {
  az containerapp update --name $speedboatInsuranceAppName --resource-group $ResourceGroupName --set-env-vars "PRODUCT_WEB_URL=$insuranceFrontendUrl" "DEPLOYMENT_TOKEN=$deployToken" | Out-Null
}

# B. BUILD & UPLOAD FRONTENDS: "Bake" the Backend URLs into the static JS files
#    We run 'npm run build' HERE (not earlier) because we finally have the real Cloud URLs for the APIs.
Write-Host "Building Home frontend (Vite) with API=$containerAppUrl and product URLs"
Build-ViteFrontend -FrontendPath $frontendPath -Env @{
  VITE_API_BASE_URL = $containerAppUrl
  VITE_TRAVEL_WEB_URL = $travelFrontendUrl
  VITE_DSL_WEB_URL = $dslFrontendUrl
  VITE_INSURANCE_WEB_URL = $insuranceFrontendUrl
}

Upload-StaticSite -AccountName $homeFrontendStorageAccountName -AccountKey $homeStorageKey -DistPath (Join-Path $frontendPath "dist")

# Build + upload product frontends
Write-Host "Building Travel product site"
Build-ViteFrontend -FrontendPath $frontendTravelPath -Env @{
  VITE_SPEEDBOAT_URL = $speedboatUrl
  VITE_HOME_URL = $homeFrontendUrl
  VITE_CORE_URL = $containerAppUrl
}
Upload-StaticSite -AccountName $travelFrontendStorageAccountName -AccountKey $travelStorageKey -DistPath (Join-Path $frontendTravelPath "dist")

Write-Host "Building DSL product site"
Build-ViteFrontend -FrontendPath $frontendDslPath -Env @{
  VITE_SPEEDBOAT_URL = $speedboatDslUrl
  VITE_HOME_URL = $homeFrontendUrl
  VITE_CORE_URL = $containerAppUrl
}
Upload-StaticSite -AccountName $dslFrontendStorageAccountName -AccountKey $dslStorageKey -DistPath (Join-Path $frontendDslPath "dist")

Write-Host "Building Insurance product site"
Build-ViteFrontend -FrontendPath $frontendInsurancePath -Env @{
  VITE_SPEEDBOAT_URL = $speedboatInsuranceUrl
  VITE_HOME_URL = $homeFrontendUrl
  VITE_CORE_URL = $containerAppUrl
}
Upload-StaticSite -AccountName $insuranceFrontendStorageAccountName -AccountKey $insuranceStorageKey -DistPath (Join-Path $frontendInsurancePath "dist")

Write-Host "Deployed Home URL: $homeFrontendUrl"
Write-Host "Deployed Travel URL: $travelFrontendUrl"
Write-Host "Deployed DSL URL: $dslFrontendUrl"
Write-Host "Deployed Insurance URL: $insuranceFrontendUrl"
