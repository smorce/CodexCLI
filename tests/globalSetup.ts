import { execa } from 'execa';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as fs from 'fs';

export default async function setup() {
  console.log('Starting global test setup: Programmatically generating test schema...');

  // 1. Define paths and URLs
  const testDbFile = `test-${randomUUID()}.db`;
  const tempSchemaPath = path.join(process.cwd(), 'prisma', 'schema.test.prisma');
  const dbPath = path.join(process.cwd(), 'prisma', testDbFile);
  const dbUrl = `file:${dbPath}`;

  // 2. Read the master schema file
  const masterSchemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma');
  const masterSchema = fs.readFileSync(masterSchemaPath, 'utf-8');

  // 3. Replace the datasource block with a SQLite configuration
  const testSchema = masterSchema.replace(
    /datasource\s+db\s+\{[\s\S]*?\}/,
    `datasource db {\n  provider = "sqlite"\n  url      = "${dbUrl}"\n}`
  );

  // 4. Write the temporary test schema
  fs.writeFileSync(tempSchemaPath, testSchema);
  console.log(`Temporary test schema created at: ${tempSchemaPath}`);

  // 5. Set the DATABASE_URL for the Prisma Client in the test environment
  // Although the URL is in the schema, setting it here ensures the client connects correctly.
  process.env.DATABASE_URL = dbUrl;

  try {
    // 6. Run `prisma db push` using the temporary test schema
    await execa('npx', [
      'prisma',
      'db',
      'push',
      '--schema',
      tempSchemaPath,
      '--force-reset',
    ], {
      stdio: 'inherit',
    });
    console.log('Global test setup complete: SQLite database is ready.');
  } catch (e) {
    console.error('FATAL: Global test setup failed while pushing schema.', e);
    process.exit(1);
  }

  // 7. Return a teardown function to clean up all temporary files
  return async () => {
    console.log('Global test teardown: Deleting temporary files...');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(tempSchemaPath)) fs.unlinkSync(tempSchemaPath);
  };
}