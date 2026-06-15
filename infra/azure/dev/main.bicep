// infra/azure/dev/main.bicep
// Azure dev environment baseline — provisioned by bootstrap skill (Step 5).
// Covers: managed identity, Key Vault, Container Registry, Container Apps.
// Azure AD B2C is configured separately after this apply — see bootstrap skill Step 5.
//
// Deploy:
//   az group create --name <project>-dev-rg --location <region>
//   az deployment group create \
//     --resource-group <project>-dev-rg \
//     --template-file main.bicep \
//     --parameters main.bicepparam

targetScope = 'resourceGroup'

@description('Project name — lowercase hyphens only, max 32 chars.')
@maxLength(32)
param projectName string

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('GitHub org or username — stored in resource tags.')
param githubOrg string

@description('Enable push notifications via Azure Notification Hubs. Set to true when push-notifications addon is declared in bootstrap-seed.json.')
param enablePushNotifications bool = false

// ─── Derived names ─────────────────────────────────────────────────────────────
// Key Vault: max 24 chars, alphanumeric + hyphens.
// ACR:       max 50 chars, alphanumeric only.
var kvName  = '${take(projectName, 16)}-dev-kv'           // ≤ 23 chars
var acrName = '${take(replace(projectName, '-', ''), 14)}devacr'  // ≤ 20 chars

var tags = {
  project: projectName
  environment: 'dev'
  owner: githubOrg
  'ai-managed': 'true'
}

var notifNamespaceName = '${take(projectName, 38)}-dev-nh-ns'  // ≤ 48 chars (max 50)

// ─── Managed Identity ──────────────────────────────────────────────────────────
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${projectName}-dev-identity'
  location: location
  tags: tags
}

// ─── Key Vault ─────────────────────────────────────────────────────────────────
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  tags: tags
  properties: {
    sku: { family: 'A', name: 'standard' }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true    // RBAC roles instead of access policies
    enableSoftDelete: true
    softDeleteRetentionInDays: 7     // minimum — dev only
    enablePurgeProtection: false     // allow hard-delete in dev
  }
}

// Grant the managed identity read access to secrets at runtime
resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, identity.id, '4633458b-17de-408a-b874-0445c86b69e6')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '4633458b-17de-408a-b874-0445c86b69e6'  // Key Vault Secrets User
    )
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ─── Container Registry ────────────────────────────────────────────────────────
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false   // use managed identity, not admin credentials
  }
}

// Grant the managed identity permission to pull images from the registry
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, identity.id, '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      '7f951dda-4ed3-4680-a7ca-43fe172d538d'  // AcrPull
    )
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ─── Log Analytics (required by Container Apps) ────────────────────────────────
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${projectName}-dev-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ─── Container Apps Environment ────────────────────────────────────────────────
resource appsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${projectName}-dev-env'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        // listKeys() is evaluated at deploy time and stored in plain text in ARM
        // deployment history — accessible to anyone with read access to the RG.
        // Acceptable for dev; production should use Diagnostic Settings with managed
        // identity to avoid embedding the workspace key in deployment records.
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ─── Container App — first service placeholder ─────────────────────────────────
// Bootstrap skill replaces 'api' with the first service name from bootstrap-seed.json.
// Add one resource block per additional service (copy this block, change the name).
resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${projectName}-dev-api'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    managedEnvironmentId: appsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
      }
      registries: [
        {
          server: registry.properties.loginServer
          identity: identity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          // Placeholder image — replaced on first deploy by CI/CD
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: '0.25'
            memory: '0.5Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'development' }
            { name: 'KEY_VAULT_URI', value: keyVault.properties.vaultUri }
          ]
        }
      ]
      scale: {
        minReplicas: 0   // scale to zero when idle — dev cost saving
        maxReplicas: 3
      }
    }
  }
}

// ─── Push Notification Hub (optional — push-notifications addon) ───────────────
resource notifNamespace 'Microsoft.NotificationHubs/namespaces@2023-09-01' = if (enablePushNotifications) {
  name: notifNamespaceName
  location: location
  tags: tags
  sku: { name: 'Free' }
}

resource notifHub 'Microsoft.NotificationHubs/namespaces/notificationHubs@2023-09-01' = if (enablePushNotifications) {
  name: '${notifNamespaceName}/default'
  location: location
  tags: tags
  properties: {}
  dependsOn: [notifNamespace]
}

// ─── Outputs ───────────────────────────────────────────────────────────────────
// Bootstrap skill stores these in infra/bootstrap.json after provisioning.
output identityClientId string = identity.properties.clientId
output keyVaultUri string = keyVault.properties.vaultUri
output keyVaultName string = keyVault.name
output registryLoginServer string = registry.properties.loginServer
output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
output notifHubEnabled bool = enablePushNotifications
output notifHubNamespace string = enablePushNotifications ? notifNamespaceName : ''
output notifHubName string = enablePushNotifications ? 'default' : ''
