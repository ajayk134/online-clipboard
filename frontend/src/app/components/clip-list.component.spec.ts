import { TestBed } from '@angular/core/testing';
import { ClipListComponent } from './clip-list.component';
import { ClipService } from '../services/clip.service';
import { Router } from '@angular/router';
import { Clip, ContentType } from '../models';

class MockClipService {
  clips = jasmine.createSpyObj('clips', ['clips']) as unknown as () => Clip[];
  total = jasmine.createSpyObj('total', ['total']) as unknown as () => number;
  getClips = jasmine.createSpy('getClips').and.returnValue(Promise.resolve({ items: [], total: 0 }));
  getTags = jasmine.createSpy('getTags').and.returnValue(Promise.resolve({ tags: [] }));
  getStats = jasmine.createSpy('getStats').and.returnValue(Promise.resolve({
    total: 0, favorites: 0, pinned: 0, copies: 0, views: 0, shared: 0,
  }));
}

class MockRouter {
  navigate = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true));
}

const makeClip = (overrides: Partial<Clip>): Clip => ({
  id: 1,
  user_id: 1,
  title: 'T',
  content: 'c',
  excerpt: 'c',
  contentType: 'text',
  language: '',
  tags: [],
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
  ...overrides,
});

describe('ClipListComponent', () => {
  let component: ClipListComponent;
  let clipService: MockClipService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ClipService, useClass: MockClipService },
        { provide: Router, useClass: MockRouter },
        ClipListComponent,
      ],
    });
    component = TestBed.inject(ClipListComponent);
    clipService = TestBed.inject(ClipService) as unknown as MockClipService;
  });

  it('visibleClips filters by search query', () => {
    clipService.clips.and.returnValue([
      makeClip({ title: 'Alpha', content: 'x' }),
      makeClip({ title: 'Beta', content: 'gamma' }),
    ]);
    component.searchQ.set('alpha');
    const visible = component.visibleClips();
    expect(visible.length).toBe(1);
    expect(visible[0].title).toBe('Alpha');
  });

  it('visibleClips filters by content type', () => {
    clipService.clips.and.returnValue([
      makeClip({ contentType: 'text' }),
      makeClip({ contentType: 'code' }),
      makeClip({ contentType: 'richtext' }),
    ]);
    component.typeFilter.set('code');
    expect(component.visibleClips().length).toBe(1);
    expect(component.visibleClips()[0]!.contentType).toBe('code');
  });

  it('visibleClips filters by favorite', () => {
    clipService.clips.and.returnValue([
      makeClip({ isFavorite: true }),
      makeClip({ isFavorite: false }),
      makeClip({ isFavorite: true }),
    ]);
    component.showFilter.set('favorite');
    expect(component.visibleClips().length).toBe(2);
    expect(component.visibleClips().every((c) => c.isFavorite)).toBeTrue();
  });

  it('visibleClips filters by pinned', () => {
    clipService.clips.and.returnValue([
      makeClip({ isPinned: true }),
      makeClip({ isPinned: false }),
    ]);
    component.showFilter.set('pinned');
    expect(component.visibleClips().length).toBe(1);
    expect(component.visibleClips()[0]!.isPinned).toBeTrue();
  });

  it('filteredCount reports number of visible clips', () => {
    clipService.clips.and.returnValue([makeClip({}), makeClip({}), makeClip({})]);
    expect(component.filteredCount()).toBe(3);
  });

  it('totalPages computes pages from total and pageSize', () => {
    clipService.total.and.returnValue(45);
    component.pageSize = 20;
    expect(component.totalPages()).toBe(3);
    clipService.total.and.returnValue(0);
    expect(component.totalPages()).toBe(1);
  });

  it('load passes offset based on current page', async () => {
    clipService.getClips.and.returnValue(Promise.resolve({ items: [], total: 0 }));
    component.page.set(3);
    await component.load();
    expect(clipService.getClips).toHaveBeenCalledWith(
      jasmine.objectContaining({ offset: 40, limit: 20 })
    );
  });

  it('prevPage decrements page but not below 1', () => {
    component.page.set(1);
    component.prevPage();
    expect(component.page()).toBe(1);
    component.page.set(3);
    component.prevPage();
    expect(component.page()).toBe(2);
  });

  it('nextPage increments page', () => {
    component.page.set(1);
    component.nextPage();
    expect(component.page()).toBe(2);
  });

  it('openEditor navigates to new editor when no clip', () => {
    component.openEditor();
    expect(MockRouter.prototype.navigate).toHaveBeenCalledWith(['/app/editor', 'new']);
  });

  it('openEditor navigates to existing editor when clip given', () => {
    component.openEditor({ id: 7 } as Clip);
    expect(MockRouter.prototype.navigate).toHaveBeenCalledWith(['/app/editor', 7]);
  });
});
