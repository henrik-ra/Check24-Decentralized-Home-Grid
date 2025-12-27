targetScope = 'resourceGroup'

@description('Location for all resources.')
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

@description('Ingest API key used by the speedboat-travel producer (should match ingestKeyTravel).')
@secure()
param speedboatIngestApiKey string = ''

@description('MongoDB connection string (MongoDB Atlas) for user identity. If empty, auth endpoints are disabled.')
@secure()
param mongoDbUri string

@description('JWT signing secret. If empty, auth endpoints are disabled.')
@secure()
param jwtSecret string

@description('Demo user id for the speedboat producer (should match the user id used by auth; this PoC uses email as user id).')
param demoUserId string = 'demo@example.com'

var effectiveSpeedboatIngestApiKey = empty(speedboatIngestApiKey) ? ingestKeyTravel : speedboatIngestApiKey

@description('CPU cores for the container app.')
param containerCpu string = '0.5'

@description('Memory for the container app (e.g. "1.0Gi").')
param containerMemory string = '1.0Gi'

var unique = toLower(substring(uniqueString(resourceGroup().id, namePrefix), 0, 6))
var deployUnique = toLower(substring(uniqueString(resourceGroup().id, deployment().name), 0, 6))
var acrName = toLower('${namePrefix}acr${unique}')
var redisName = toLower('${namePrefix}redis${unique}')
var caeName = toLower('${namePrefix}-cae-${unique}')
var appName = toLower('${namePrefix}-home-core-${unique}')
var speedboatAppName = toLower('${namePrefix}-speedboat-travel-${unique}')
var webStorageName = toLower('${namePrefix}web${unique}')

// NOTE: We intentionally deploy the storage account as native resources (not AVM)
// because the AVM module currently doesn't expose the blob static website settings.

// --------------------
// Frontend static website hosting (Azure Storage)
// --------------------
resource webStorage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: webStorageName
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

resource webBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: webStorage
  name: 'default'
  properties: {}
}

resource webContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: webBlobService
  name: '$web'
  properties: {
    publicAccess: 'Blob'
  }
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
        name: 'mongodb-uri'
        value: mongoDbUri
      }
      {
        name: 'jwt-secret'
        value: jwtSecret
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

    // This is a background job; no ingress needed.
    disableIngress: true

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

@description('Container App name.')
output containerAppName string = containerApp.outputs.name

@description('Container App fully-qualified domain name.')
output containerAppFqdn string = containerApp.outputs.fqdn

@description('Public base URL of the Container App.')
output containerAppUrl string = 'https://${containerApp.outputs.fqdn}'

@description('Speedboat-travel Container App name.')
output speedboatContainerAppName string = speedboatContainerApp.outputs.name

@description('ACR name.')
output acrName string = acr.outputs.name

@description('ACR login server.')
output acrLoginServer string = acr.outputs.loginServer

@description('Redis host name.')
output redisHostName string = redis.outputs.hostName

@description('Redis SSL port.')
output redisSslPort int = redis.outputs.sslPort

@description('Frontend storage account name (static website).')
output frontendStorageAccountName string = webStorage.name
