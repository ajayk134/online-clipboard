import { TestBed } from '@angular/core/testing';
import { ClipService } from './clip.service';
import { ApiService } from './api.service';
import {
  Clip,
  ClipListResponse,
  StatsResponse,
  TagsResponse,
} from '../models';

class MockApiService {
  get: any = jasmine.createSpy('get');
  post: any = jasmine.createSpy('post');
  patch: any = jasmine.createSpy('patch');
  delete: any = jasmine.createSpy('delete');
}

describe('ClipService', () => {
  let service: ClipService;
  let api: MockApiService;

  const clip: Clip = {
    id: 1,
    user_id: 1,
    title: 'T',
    content: 'c',
    excerpt: 'c',
    contentType: 'text',
    language: '',
    tags: ['a'],
    isPinned: false,
    isFavorite: false,
    copyCount: 0,
    viewCount: 0,
    shareToken: null,
    shareEnabled: false,
    expiresAt: null,
    isOneTime: false,
    readCount: 0,
    createdAt: 't',
    updatedAt: 't',
  };
  const list: ClipListResponse = { items: [clip], total: 1 };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useClass: MockApiService }, ClipService],
    });
    service = TestBed.inject(ClipService);
    api = TestBed.inject(ApiService) as unknown as MockApiService;
  });

  it('getClips sends query params and updates signals', async () => {
    api.get = jasmine.createSpy('get').and.returnValue(Promise.resolve(list));
    const res = await service.getClips({ q: 'hello', tag: 'js', favorite: true, limit: 5, offset: 0 });
    expect(api.get).toHaveBeenCalledWith('/clips', {
      params: {
        q: 'hello', tag: 'js', favorite: 'true', pinned: '', type: '', sort: '', limit: '5', offset: '0',
      },
    });
    expect(res).toBe(list);
    expect(service.clips()).toEqual([clip]);
    expect(service.total()).toBe(1);
    expect(service.loading()).toBeFalse();
  });

  it('getClips resets loading even on error', async () => {
    api.get = jasmine.createSpy('get').and.returnValue(Promise.reject(new Error('down')));
    await expectAsync(service.getClips()).toBeRejectedWithError('down');
    expect(service.loading()).toBeFalse();
  });

  it('getClip fetches a single clip', async () => {
    api.get = jasmine.createSpy('get').and.returnValue(Promise.resolve(clip));
    const res = await service.getClip(1);
    expect(api.get).toHaveBeenCalledWith('/clips/1');
    expect(res).toBe(clip);
  });

  it('createClip posts to /clips', async () => {
    api.post = jasmine.createSpy('post').and.returnValue(Promise.resolve(clip));
    const body = { title: 'T', content: 'c', contentType: 'text' as const };
    const res = await service.createClip(body);
    expect(api.post).toHaveBeenCalledWith('/clips', body);
    expect(res).toBe(clip);
  });

  it('updateClip patches /clips/:id', async () => {
    api.patch = jasmine.createSpy('patch').and.returnValue(Promise.resolve(clip));
    const res = await service.updateClip(1, { title: 'T2' });
    expect(api.patch).toHaveBeenCalledWith('/clips/1', { title: 'T2' });
    expect(res).toBe(clip);
  });

  it('deleteClip deletes /clips/:id', async () => {
    api.delete = jasmine.createSpy('delete').and.returnValue(Promise.resolve(undefined));
    await service.deleteClip(1);
    expect(api.delete).toHaveBeenCalledWith('/clips/1');
  });

  it('copyClip patches /clips/:id/copy', async () => {
    api.patch = jasmine.createSpy('patch').and.returnValue(Promise.resolve({ ok: true }));
    const res = await service.copyClip(1);
    expect(api.patch).toHaveBeenCalledWith('/clips/1/copy');
    expect(res).toEqual({ ok: true });
  });

  it('toggleFlags patches /clips/:id/flags', async () => {
    api.patch = jasmine.createSpy('patch').and.returnValue(Promise.resolve(clip));
    const res = await service.toggleFlags(1, { isFavorite: true });
    expect(api.patch).toHaveBeenCalledWith('/clips/1/flags', { isFavorite: true });
    expect(res).toBe(clip);
  });

  it('shareClip posts /clips/:id/share', async () => {
    api.post = jasmine.createSpy('post').and.returnValue(Promise.resolve(clip));
    const res = await service.shareClip(1, { enabled: true, oneTime: true });
    expect(api.post).toHaveBeenCalledWith('/clips/1/share', { enabled: true, oneTime: true });
    expect(res).toBe(clip);
  });

  it('getQr requests blob responseType', async () => {
    api.get = jasmine.createSpy('get').and.returnValue(Promise.resolve(new Blob([], { type: 'image/png' })));
    const res = await service.getQr(1);
    expect(api.get).toHaveBeenCalledWith('/clips/1/qr', { responseType: 'blob' });
    expect(res).toBeInstanceOf(Blob);
  });

  it('exportClip passes format param and blob responseType', async () => {
    api.get = jasmine.createSpy('get').and.returnValue(Promise.resolve(new Blob([], { type: 'text/plain' })));
    await service.exportClip(1, 'md');
    expect(api.get).toHaveBeenCalledWith('/clips/1/export', { params: { format: 'md' }, responseType: 'blob' });
  });

  it('exportAll requests /clips/export blob', async () => {
    api.get = jasmine.createSpy('get').and.returnValue(Promise.resolve(new Blob([], { type: 'application/json' })));
    await service.exportAll();
    expect(api.get).toHaveBeenCalledWith('/clips/export', { responseType: 'blob' });
  });

  it('importClips posts /clips/import with items', async () => {
    api.post = jasmine.createSpy('post').and.returnValue(Promise.resolve({ imported: 2, errors: [] }));
    const items = [{ content: 'a' }, { content: 'b' }];
    const res = await service.importClips(items);
    expect(api.post).toHaveBeenCalledWith('/clips/import', { items });
    expect(res.imported).toBe(2);
  });

  it('getTags updates tags signal', async () => {
    const tags: TagsResponse = { tags: [{ tag: 'red', count: 2 }] };
    api.get = jasmine.createSpy('get').and.returnValue(Promise.resolve(tags));
    const res = await service.getTags();
    expect(api.get).toHaveBeenCalledWith('/clips/tags');
    expect(service.tags()).toEqual([{ tag: 'red', count: 2 }]);
    expect(res).toBe(tags);
  });

  it('getStats updates stats signal', async () => {
    const stats: StatsResponse = { total: 3, favorites: 1, pinned: 0, copies: 5, views: 10, shared: 2 };
    api.get = jasmine.createSpy('get').and.returnValue(Promise.resolve(stats));
    const res = await service.getStats();
    expect(api.get).toHaveBeenCalledWith('/clips/stats');
    expect(service.stats()).toEqual(stats);
    expect(res).toBe(stats);
  });
});
