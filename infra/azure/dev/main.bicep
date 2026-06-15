// infra/azure/dev/main.bicep
// Starter IaC template for Azure dev environment.
// Provisions: Container Apps Environment, Container Registry, Key Vault, Notification Hubs.
// Copy as-is to new projects — uses Bicep param declarations, no {{placeholders}}.
// Parameters are supplied via main.bicepparam (substitute {{placeholders}} there).
//
// Usage:
//   az group create --name "<project>-dev-rg" --location "<region>"
//   az deployment group create \
//     --resource-group "<project>-dev-rg" \
//     --template-file infra/azure/dev/main.bicep \
//     --parameters infra/azure/dev/main.bicepparam

targetScope = 'resourceGroup'

@description('Project name (lowercase, hyphens only). Used as a prefix for all resource names.')
param projectName string

@description('Azure region. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('GitHub Actions service principal client ID (leave empty to skip role assignment).')
param githubActionsClientId string = ''

var envName = '${projectName}-dev'
var tags = {
  project:     projectName
  environment: 'dev'
  'ai-managed': 'true'
}

// ── Container Apps Environment ──────────────────────────────────────────────────────────────────────
resource cae 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name:     '${envName}-cae'
  location: location
  tags:     tags
  properties: {
    appLogsConfiguration: {
      destination: 'azure-monitor'
    }
  }
}

// ── Azure Container Registry ──────────────────────────────────────────────────────────────────────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  // ACR names must be alphanumeric — strip hyphens from project name
  name:     replace('${envName}acr', '-', '')
  location: location
  tags:     tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled:    false
    publicNetworkAccess: 'Enabled'
  }
}

// Grant GitHub Actions service principal AcrPush on the registry
var acrPushRoleId = '8311e382-0749-4cb8-b61a-304f252e45ec'
resource acrPushAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(githubActionsClientId)) {
  name:  guid(acr.id, githubActionsClientId, acrPushRoleId)
  scope: acr
  properties: {
    roleDefinitionId:    subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPushRoleId)
    principalId:         githubActionsClientId
    principalType:       'ServicePrincipal'
  }
}

// ── Key Vault ──────────────────────────────────────────────────────────────────────────────────────────────
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

// Grant GitHub Actions service principal Key Vault Secrets User
var kvSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
resource kvSecretsUserAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(githubActionsClientId)) {
  name:  guid(kv.id, githubActionsClientId, kvSecretsUserRoleId)
  scope: kv
  properties: {
    roleDefinitionId:    subscriptionResourceId('Microsoft.Authorization/roleDefinitions', kvSecretsUserRoleId)
    principalId:         githubActionsClientId
    principalType:       'ServicePrincipal'
  }
}

// ── Notification Hubs (push-notifications addon) ──────────────────────────────────────────────────
resource anhNamespace 'Microsoft.NotificationHubs/namespaces@2023-10-01-preview' = {
  name:     '${envName}-nh-ns'
  location: location
  tags:     tags
  sku: { name: 'Free' }
  properties: {}
}

resource anh 'Microsoft.NotificationHubs/namespaces/notificationHubs@2023-10-01-preview' = {
  parent:   anhNamespace
  name:     'default'
  location: location
  tags:     tags
  properties: {}
}

// ── Outputs ────────────────────────────────────────────────────────────────────────────────────────────────
output keyVaultName           string = kv.name
output registryLoginServer    string = acr.properties.loginServer
output containerAppsEnvId    string = cae.id
output notificationHubNamespace string = anhNamespace.name
