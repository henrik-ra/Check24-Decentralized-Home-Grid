/*
Bicep cannot solve the deployment completely on its own because:

Problem: Container Apps need storage URLs BEFORE they start
Storage URLs exist AFTER the Bicep deployment

Solution: 2-phase deployment
Phase 1: Bicep (Infrastructure)
Phase 2: PowerShell (Configuration)
*/
targetScope = 'resourceGroup'

// ==============================================================================
// 1. PARAMETERS (Configuration inputs)
// ==============================================================================
param location string = resourceGroup().location

@description('Short prefix used to build resource names (keep it short).')
@minLength(2)
@maxLength(12)
param namePrefix string = 'c24'

@description('Container image tag to deploy (e.g. "latest" or a git sha).')
param imageTag string = 'latest'

@description('Ingest API key for the travel product. The home-core expects this as env var INGEST_KEY_TRAVEL.')
@secure()
param ingestKeyTravel string

@description('Ingest API key for the dsl product. The home-core expects this as env var INGEST_KEY_DSL.')
@secure()
param ingestKeyDsl string = ingestKeyTravel

@description('Ingest API key for the insurance product. The home-core expects this as env var INGEST_KEY_INSURANCE.')
@secure()
param ingestKeyInsurance string = ingestKeyTravel

@description('Ingest API key used by the speedboat-travel producer (should match ingestKeyTravel).')
@secure()
param speedboatIngestApiKey string = ''

@description('Ingest API key used by the speedboat-dsl producer (should match ingestKeyDsl).')
@secure()
param speedboatDslIngestApiKey string = ''

@description('Ingest API key used by the speedboat-insurance producer (should match ingestKeyInsurance).')
@secure()
param speedboatInsuranceIngestApiKey string = ''

@description('MongoDB connection string (MongoDB Atlas) for user identity. If empty, auth endpoints are disabled.')
@secure()
param mongoDbUri string

@description('JWT signing secret. If empty, auth endpoints are disabled.')
@secure()
param jwtSecret string

@description('OpenRouter API key for LLM-based welcome text generation. Optional.')
@secure()
param openRouterApiKey string = ''

@description('Demo user id for the speedboat producer (should match the user id used by auth; this PoC uses email as user id).')
param demoUserId string = 'demo@example.com'

var effectiveSpeedboatIngestApiKey = empty(speedboatIngestApiKey) ? ingestKeyTravel : speedboatIngestApiKey
var effectiveSpeedboatDslIngestApiKey = empty(speedboatDslIngestApiKey) ? ingestKeyDsl : speedboatDslIngestApiKey
var effectiveSpeedboatInsuranceIngestApiKey = empty(speedboatInsuranceIngestApiKey) ? ingestKeyInsurance : speedboatInsuranceIngestApiKey

@description('CPU cores for the container app.')
param containerCpu string = '0.5'

@description('Memory for the container app (e.g. "1.0Gi").')
param containerMemory string = '1.0Gi'

// ==============================================================================
// 2. VARIABLES (Naming conventions & computed values)
// ==============================================================================
var unique = toLower(substring(uniqueString(resourceGroup().id, namePrefix), 0, 6))
var deployUnique = toLower(substring(uniqueString(resourceGroup().id, deployment().name), 0, 6))
var acrName = toLower('${namePrefix}acr${unique}')
var redisName = toLower('${namePrefix}redis${unique}')
var caeName = toLower('${namePrefix}-cae-${unique}')
var appName = toLower('${namePrefix}-home-core-${unique}')
var speedboatAppName = toLower('${namePrefix}-speedboat-travel-${unique}')
var speedboatDslAppName = toLower('${namePrefix}-speedboat-dsl-${unique}')
var speedboatInsuranceAppName = toLower('${namePrefix}-speedboat-insurance-${unique}')

// Storage account names must be globally unique and <= 24 chars.
var homeWebStorageName = toLower('${namePrefix}w${unique}h')
var travelWebStorageName = toLower('${namePrefix}w${unique}t')
var dslWebStorageName = toLower('${namePrefix}w${unique}d')
var insuranceWebStorageName = toLower('${namePrefix}w${unique}i')

// ==============================================================================
// 3. FRONTEND STATIC WEBSITES (Azure Storage)
// ==============================================================================
// NOTE: We intentionally deploy the storage account as native resources (not AVM)
// because the AVM module currently doesn't expose the blob static website settings.

// --------------------
// Frontend static website hosting (Azure Storage)
// --------------------
resource homeWebStorage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: homeWebStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true

    // Required for serving content publicly via static website.
    allowBlobPublicAccess: true

    // Keep it simple for PoC: public access.
    publicNetworkAccess: 'Enabled'
  }
}

resource homeWebBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: homeWebStorage
  name: 'default'
  properties: {}
}

resource homeWebContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: homeWebBlobService
  name: '$web'
  properties: {
    publicAccess: 'Blob'
  }
}

resource travelWebStorage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: travelWebStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: true
    publicNetworkAccess: 'Enabled'
  }
}

resource travelWebBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: travelWebStorage
  name: 'default'
  properties: {}
}

resource travelWebContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: travelWebBlobService
  name: '$web'
  properties: {
    publicAccess: 'Blob'
  }
}

resource dslWebStorage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: dslWebStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: true
    publicNetworkAccess: 'Enabled'
  }
}

resource dslWebBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: dslWebStorage
  name: 'default'
  properties: {}
}

resource dslWebContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: dslWebBlobService
  name: '$web'
  properties: {
    publicAccess: 'Blob'
  }
}

resource insuranceWebStorage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: insuranceWebStorageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: true
    publicNetworkAccess: 'Enabled'
  }
}

resource insuranceWebBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: insuranceWebStorage
  name: 'default'
  properties: {}
}

resource insuranceWebContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: insuranceWebBlobService
  name: '$web'
  properties: {
    publicAccess: 'Blob'
  }

  //==============================================================================
// 4. SHARED INFRASTRUCTURE (Environment, Registry, Redis)
// ==============================================================================
// 
}

// --------------------
// Container Apps Environment
// --------------------
module managedEnvironment 'br/public:avm/res/app/managed-environment:0.11.3' = {
  name: 'cae-${unique}-${deployUnique}'
  params: {
    name: caeName
    location: location
    publicNetworkAccess: 'Enabled'
    zoneRedundant: false
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

// --------------------
// Azure Container Registry (ACR)
// --------------------
module acr 'br/public:avm/res/container-registry/registry:0.9.3' = {
  name: 'acr-${unique}-${deployUnique}'
  params: {
    name: acrName
    location: location
    acrSku: 'Basic'
    acrAdminUserEnabled: true
  }
}

resource acrResource 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
  dependsOn: [
    acr
  ]
}

var acrCreds = acrResource.listCredentials()
var acrUsername = acrCreds.username
var acrPassword = acrCreds.passwords[0].value

// --------------------
// Azure Cache for Redis
// --------------------
module redis 'br/public:avm/res/cache/redis:0.16.4' = {
  name: 'redis-${unique}-${deployUnique}'
  params: {
    name: redisName
    location: location
    skuName: 'Basic'
    capacity: 0
    minimumTlsVersion: '1.2'
    enableNonSslPort: false
  }
}

resource redisResource 'Microsoft.Cache/redis@2024-11-01' existing = {
  name: redisName
  dependsOn: [
    redis
  ]
}

// ==============================================================================
// 5. BACKEND SERVICES (Core & Speedboats)
// ==============================================================================
// 

var redisKeys = redisResource.listKeys()
var redisPrimaryKey = redisKeys.primaryKey
var redisUrl = 'rediss://:${redisPrimaryKey}@${redis.outputs.hostName}:${string(redis.outputs.sslPort)}'

// --------------------
// Container App
// --------------------
module containerApp 'br/public:avm/res/app/container-app:0.18.2' = {
  name: 'app-${unique}-${deployUnique}'
  params: {
    name: appName
    location: location
    environmentResourceId: managedEnvironment.outputs.resourceId

    ingressExternal: true
    ingressAllowInsecure: false
    ingressTargetPort: 3000
    ingressTransport: 'auto'

    scaleSettings: {
      minReplicas: 1
      maxReplicas: 5
    }

    // Registry credential and app secrets
    secrets: [
      {
        name: 'acr-pwd'
        value: acrPassword
      }
      {
        name: 'redis-url'
        value: redisUrl
      }
      {
        name: 'ingest-key-travel'
        value: ingestKeyTravel
      }
      {
        name: 'ingest-key-dsl'
        value: ingestKeyDsl
      }
      {
        name: 'ingest-key-insurance'
        value: ingestKeyInsurance
      }
      {
        name: 'mongodb-uri'
        value: mongoDbUri
      }
      {
        name: 'jwt-secret'
        value: jwtSecret
      }
      {
        name: 'openrouter-api-key'
        value: openRouterApiKey
      }
    ]

    registries: [
      {
        server: acr.outputs.loginServer
        username: acrUsername
        passwordSecretRef: 'acr-pwd'
      }
    ]

    containers: [
      {
        name: 'home-core'
        image: '${acr.outputs.loginServer}/home-core:${imageTag}'
        resources: {
          cpu: containerCpu
          memory: containerMemory
        }
        env: [
          {
            name: 'HOST'
            value: '0.0.0.0'
          }
          {
            name: 'PORT'
            value: '3000'
          }
          {
            name: 'REDIS_URL'
            secretRef: 'redis-url'
          }
          {
            name: 'INGEST_KEY_TRAVEL'
            secretRef: 'ingest-key-travel'
          }
          {
            name: 'INGEST_KEY_DSL'
            secretRef: 'ingest-key-dsl'
          }
          {
            name: 'INGEST_KEY_INSURANCE'
            secretRef: 'ingest-key-insurance'
          }
          {
            name: 'MONGODB_URI'
            secretRef: 'mongodb-uri'
          }
          {
            name: 'JWT_SECRET'
            secretRef: 'jwt-secret'
          }
          {
            name: 'JWT_EXPIRES_IN'
            value: '7d'
          }
          {
            name: 'OPENROUTER_API_KEY'
            secretRef: 'openrouter-api-key'
          }
          {
            name: 'OPENROUTER_SITE_URL'
            value: 'https://check24-home-poc.example.com'
          }
          {
            name: 'OPENROUTER_APP_NAME'
            value: 'CHECK24 Home PoC'
          }
          {
            name: 'WELCOME_TEXT_TTL_SECONDS'
            value: '300'
          }
          // Filled later by deploy.ps1 (after static sites exist)
          {
            name: 'TRAVEL_WEB_URL'
            value: ''
          }
          {
            name: 'DSL_WEB_URL'
            value: ''
          }
          {
            name: 'INSURANCE_WEB_URL'
            value: ''
          }
        ]
      }
    ]
  }
}

// --------------------
// Speedboat producer (pushes snapshots into home-core)
// --------------------
module speedboatContainerApp 'br/public:avm/res/app/container-app:0.18.2' = {
  name: 'speedboat-${unique}-${deployUnique}'
  params: {
    name: speedboatAppName
    location: location
    environmentResourceId: managedEnvironment.outputs.resourceId

    // Enable ingress for simulation endpoint
    ingressExternal: true
    ingressTargetPort: 3000
    ingressTransport: 'auto'

    scaleSettings: {
      minReplicas: 1
      maxReplicas: 1
    }

    secrets: [
      {
        name: 'acr-pwd'
        value: acrPassword
      }
      {
        name: 'ingest-api-key'
        value: effectiveSpeedboatIngestApiKey
      }
    ]

    registries: [
      {
        server: acr.outputs.loginServer
        username: acrUsername
        passwordSecretRef: 'acr-pwd'
      }
    ]

    containers: [
      {
        name: 'speedboat-travel'
        image: '${acr.outputs.loginServer}/speedboat-travel:${imageTag}'
        resources: {
          cpu: '0.25'
          memory: '0.5Gi'
        }
        env: [
          {
            name: 'CORE_URL'
            value: 'https://${containerApp.outputs.fqdn}'
          }
          {
            name: 'PRODUCT_ID'
            value: 'travel'
          }
          // Filled later by deploy.ps1 (after static site exists)
          {
            name: 'PRODUCT_WEB_URL'
            value: ''
          }
          {
            name: 'INGEST_API_KEY'
            secretRef: 'ingest-api-key'
          }
          {
            name: 'USER_IDS'
            value: demoUserId
          }
          {
            name: 'PUSH_INTERVAL_MS'
            value: '5000'
          }
        ]
      }
    ]
  }
}

module speedboatDslContainerApp 'br/public:avm/res/app/container-app:0.18.2' = {
  name: 'speedboat-dsl-${unique}-${deployUnique}'
  params: {
    name: speedboatDslAppName
    location: location
    environmentResourceId: managedEnvironment.outputs.resourceId

    ingressExternal: true
    ingressTargetPort: 3000
    ingressTransport: 'auto'

    scaleSettings: {
      minReplicas: 1
      maxReplicas: 1
    }

    secrets: [
      {
        name: 'acr-pwd'
        value: acrPassword
      }
      {
        name: 'ingest-api-key'
        value: effectiveSpeedboatDslIngestApiKey
      }
    ]

    registries: [
      {
        server: acr.outputs.loginServer
        username: acrUsername
        passwordSecretRef: 'acr-pwd'
      }
    ]

    containers: [
      {
        name: 'speedboat-dsl'
        image: '${acr.outputs.loginServer}/speedboat-dsl:${imageTag}'
        resources: {
          cpu: '0.25'
          memory: '0.5Gi'
        }
        env: [
          {
            name: 'CORE_URL'
            value: 'https://${containerApp.outputs.fqdn}'
          }
          {
            name: 'PRODUCT_ID'
            value: 'dsl'
          }
          // Filled later by deploy.ps1 (after static site exists)
          {
            name: 'PRODUCT_WEB_URL'
            value: ''
          }
          {
            name: 'INGEST_API_KEY'
            secretRef: 'ingest-api-key'
          }
          {
            name: 'PUSH_INTERVAL_MS'
            value: '5000'
          }
        ]
      }
    ]
  }
}

module speedboatInsuranceContainerApp 'br/public:avm/res/app/container-app:0.18.2' = {
  name: 'speedboat-insurance-${unique}-${deployUnique}'
  params: {
    name: speedboatInsuranceAppName
    location: location
    environmentResourceId: managedEnvironment.outputs.resourceId

    ingressExternal: true
    ingressTargetPort: 3000
    ingressTransport: 'auto'

    scaleSettings: {
      minReplicas: 1
      maxReplicas: 1
    }

    secrets: [
      {
        name: 'acr-pwd'
        value: acrPassword
      }
      {
        name: 'ingest-api-key'
        value: effectiveSpeedboatInsuranceIngestApiKey
      }
    ]

    registries: [
      {
        server: acr.outputs.loginServer
        username: acrUsername
        passwordSecretRef: 'acr-pwd'
      }
    ]

    containers: [
      {
        name: 'speedboat-insurance'
        image: '${acr.outputs.loginServer}/speedboat-insurance:${imageTag}'
        resources: {
          cpu: '0.25'
          memory: '0.5Gi'
        }
        env: [
          {
            name: 'CORE_URL'
            value: 'https://${containerApp.outputs.fqdn}'
          }
          {
            name: 'PRODUCT_ID'
            value: 'insurance'
          }
          // Filled later by deploy.ps1 (after static site exists)
          {
            name: 'PRODUCT_WEB_URL'
            value: ''
          }
          {
            name: 'INGEST_API_KEY'
            secretRef: 'ingest-api-key'
          }
          {
            name: 'PUSH_INTERVAL_MS'
            value: '5000'
          }
        ]
      }
    ]
  }
}


// ==============================================================================
// 6. OUTPUTS (To be used by deploy.ps1)
// ==============================================================================

@description('Container App name.')
output containerAppName string = containerApp.outputs.name

@description('Container App fully-qualified domain name.')
output containerAppFqdn string = containerApp.outputs.fqdn

@description('Public base URL of the Container App.')
output containerAppUrl string = 'https://${containerApp.outputs.fqdn}'

@description('Speedboat-travel Container App name.')
output speedboatContainerAppName string = speedboatContainerApp.outputs.name

@description('Speedboat-travel public URL.')
output speedboatUrl string = 'https://${speedboatContainerApp.outputs.fqdn}'

@description('Speedboat-dsl Container App name.')
output speedboatDslContainerAppName string = speedboatDslContainerApp.outputs.name

@description('Speedboat-dsl public URL.')
output speedboatDslUrl string = 'https://${speedboatDslContainerApp.outputs.fqdn}'

@description('Speedboat-insurance Container App name.')
output speedboatInsuranceContainerAppName string = speedboatInsuranceContainerApp.outputs.name

@description('Speedboat-insurance public URL.')
output speedboatInsuranceUrl string = 'https://${speedboatInsuranceContainerApp.outputs.fqdn}'

@description('ACR name.')
output acrName string = acr.outputs.name

@description('ACR login server.')
output acrLoginServer string = acr.outputs.loginServer

@description('Redis host name.')
output redisHostName string = redis.outputs.hostName

@description('Redis SSL port.')
output redisSslPort int = redis.outputs.sslPort

@description('Frontend storage account name (static website).')
output frontendStorageAccountName string = homeWebStorage.name

@description('Home frontend storage account name (static website).')
output homeFrontendStorageAccountName string = homeWebStorage.name

@description('Travel frontend storage account name (static website).')
output travelFrontendStorageAccountName string = travelWebStorage.name

@description('DSL frontend storage account name (static website).')
output dslFrontendStorageAccountName string = dslWebStorage.name

@description('Insurance frontend storage account name (static website).')
output insuranceFrontendStorageAccountName string = insuranceWebStorage.name
