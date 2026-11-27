import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { PrismaPhotoRepository } from '../src/repositories/photo-repository.js';

test('photo authors expose only public avatar URLs, hide unavailable avatars and never serialize profile internals', async () => {
  for (const status of ['PUBLISHED', 'DELETING', null]) {
    const row = { id: 'photo', uploaderId: 'owner', title: 'Photo', alt: 'Alt', width: 100, height: 100, kind: 'PHOTO', status: 'PUBLISHED', createdAt: new Date(), variants: [],
      uploader: { id: 'owner', name: 'Public name', email: 'private@example.test', passwordHash: 'test-only-hash',
        avatarPhoto: status ? { id: 'avatar', status, variants: [{ width: 512 }] } : null } };
    const db = { photo: { findUnique: async () => row } } as unknown as PrismaClient;
    const photo = await new PrismaPhotoRepository(db).find('photo');
    assert.deepEqual(photo?.uploader, { id: 'owner', name: 'Public name', avatarUrl: status === 'PUBLISHED' ? '/media/photos/avatar/512.webp' : null });
    assert.ok(!JSON.stringify(photo?.uploader).includes('private@example.test'));
  }
});
