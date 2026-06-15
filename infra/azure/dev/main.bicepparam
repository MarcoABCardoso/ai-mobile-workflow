// infra/azure/dev/main.bicepparam
// Parameter values for the Azure dev environment.
// Substitute {{placeholders}} from bootstrap-seed.json before deploying.
// Commit this file — it contains no secrets.

using './main.bicep'

param projectName            = '{{project_name}}'
param location               = '{{region}}'
param githubActionsClientId  = '' // Fill in after creating the GitHub Actions service principal
