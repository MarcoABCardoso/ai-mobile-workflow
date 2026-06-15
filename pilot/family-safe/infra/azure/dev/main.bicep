// infra/azure/dev/main.bicep (family-safe)
// Provisions the dev environment for family-safe on Azure.
// See workflow repo infra/azure/dev/main.bicep for the canonical template.

targetScope = 'resourceGroup'

@description('Project name')
param projectName string

@description('Azure region')
param location string = resourceGroup().location

@description('GitHub Actions service principal client ID (leave empty to skip role assignment).')
param githubActionsClientId string = ''

var envName = '${projectName}-dev'
var tags = {
  project:     projectName
  environment: 'dev'
  'ai-managed': 'true'
}

resource cae 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name:     '${envName}-cae'
  location: location
  tags:     tags
  properties: {
    appLogsConfiguration: { destination: 'azure-monitor' }
  }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name:     replace('${envName}acr', '-', '')
  location: location
  tags:     tags
  sku:      { name: 'Basic' }
  properties: { adminUserEnabled: false, publicNetworkAccess: 'Enabled' }
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name:     '${projectName}-kv-dev'
  location: location
  tags:     tags
  properties: {
    sku:                     { family: 'A', name: 'standard' }
    tenantId:                subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete:        true
    softDeleteRetentionInDays: 7
  }
}

resource anhNamespace 'Microsoft.NotificationHubs/namespaces@2023-10-01-preview' = {
  name:     '${envName}-nh-ns'
  location: location
  tags:     tags
  sku:      { name: 'Free' }
  properties: {}
}

resource anh 'Microsoft.NotificationHubs/namespaces/notificationHubs@2023-10-01-preview' = {
  parent:   anhNamespace
  name:     'default'
  location: location
  tags:     tags
  properties: {}
}

output keyVaultName           string = kv.name
output registryLoginServer    string = acr.properties.loginServer
output containerAppsEnvId    string = cae.id
output notificationHubNamespace string = anhNamespace.name
