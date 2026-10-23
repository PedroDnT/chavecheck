import { structuredFormat } from './schema.js';
process.stdout.write(JSON.stringify(structuredFormat, null, 2) + '\n');
