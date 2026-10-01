import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { expect, test } from 'vite-plus/test';
import { CompatibilityRecord } from '../../fixtures/nest';

test('PostgreSQL persists inferred TypeORM columns and rolls back an isolated transaction', async () => {
  const url = process.env.COMPATIBILITY_DATABASE_URL;
  if (!url)
    throw new Error(
      'COMPATIBILITY_DATABASE_URL must name a disposable PostgreSQL database',
    );
  const target = new URL(url);
  if (
    !['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(
      target.hostname,
    ) ||
    target.pathname !== '/fenforce_compatibility'
  ) {
    throw new Error(
      'Compatibility fixtures require local database fenforce_compatibility',
    );
  }
  const schema = `compat_${randomUUID().replaceAll('-', '')}`;
  const connection = new DataSource({
    type: 'postgres',
    url,
    schema,
    entities: [CompatibilityRecord],
  });
  await connection.initialize();
  try {
    await connection.query(`CREATE SCHEMA "${schema}"`);
    await connection.synchronize();
    const repository = connection.getRepository(CompatibilityRecord);
    const saved = await repository.save({ name: 'Synthetic company' });
    expect((await repository.findOneByOrFail({ id: saved.id })).name).toBe(
      'Synthetic company',
    );
    await expect(
      connection.transaction(async (manager) => {
        await manager.update(CompatibilityRecord, saved.id, {
          name: 'Must roll back',
        });
        throw new Error('rollback control');
      }),
    ).rejects.toThrow('rollback control');
    expect((await repository.findOneByOrFail({ id: saved.id })).name).toBe(
      'Synthetic company',
    );
  } finally {
    try {
      await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await connection.destroy();
    }
  }
});
