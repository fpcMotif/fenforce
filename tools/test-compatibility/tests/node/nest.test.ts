import { Test } from '@nestjs/testing';
import { expect, test } from 'vite-plus/test';
import { WorkspaceLabel, WorkspaceService } from '../../fixtures/nest';

test('Nest resolves constructor dependencies from emitted decorator metadata', async () => {
  const module = await Test.createTestingModule({
    providers: [WorkspaceLabel, WorkspaceService],
  }).compile();
  try {
    expect(module.get(WorkspaceService).read()).toBe('Synthetic workspace');
  } finally {
    await module.close();
  }
});
