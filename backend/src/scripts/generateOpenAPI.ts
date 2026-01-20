import fs from 'fs';
import path from 'path';
import { swaggerSpec } from '../config/swagger';

// Generate standalone OpenAPI JSON file
const outputPath = path.join(process.cwd(), 'openapi.json');

fs.writeFileSync(outputPath, JSON.stringify(swaggerSpec, null, 2), 'utf-8');

console.log(`OpenAPI specification generated at: ${outputPath}`);
