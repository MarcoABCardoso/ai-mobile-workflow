import { writeFileSync } from 'fs'
import yaml from 'js-yaml'
import { app } from '../src/index.js'

await app.ready()
writeFileSync('openapi.yaml', yaml.dump(app.swagger()))
await app.close()
