// infra/azure/dev/main.bicepparam
// Bootstrap skill substitutes {{placeholders}} from bootstrap-seed.json before running.
// Do not commit real values here — this file is committed with placeholders intact.

using './main.bicep'

param projectName = '{{project_name}}'
param location    = '{{region}}'
param githubOrg   = '{{github_org}}'
