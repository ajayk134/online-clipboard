import { TestBed } from '@angular/core/testing';
import { ClipEditorComponent } from './clip-editor.component';
import { ClipService } from '../services/clip.service';
import { ToastService } from '../services/toast.service';
import { Router, ActivatedRoute } from '@angular/router';
import { ContentType } from '../models';

class MockClipService {
  createClip = jasmine.createSpy('createClip').and.returnValue(Promise.resolve({ id: 9 }));
  updateClip = jasmine.createSpy('updateClip').and.returnValue(Promise.resolve({ id: 1 }));
  getClip = jasmine.createSpy('getClip').and.returnValue(Promise.resolve({
    id: 1, user_id: 1, title: 'T', content: 'c', excerpt: 'c', contentType: 'text',
    language: '', tags: [], isPinned: false, isFavorite: false, copyCount: 0,
    viewCount: 0, shareToken: null, shareEnabled: false, expiresAt: null,
    isOneTime: false, readCount: 0, createdAt: 't', updatedAt: 't',
  }));
  deleteClip = jasmine.createSpy('deleteClip').and.returnValue(Promise.resolve(undefined));
}

class MockToastService {
  success = jasmine.createSpy('success');
  error = jasmine.createSpy('error');
}

class MockRouter {
  navigate = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true));
}

function makeRoute(idParam: string | null): ActivatedRoute {
  return {
    snapshot: { paramMap: { get: (key: string) => (key === 'id' ? idParam : null) } },
  } as unknown as ActivatedRoute;
}

describe('ClipEditorComponent', () => {
  let component: ClipEditorComponent;
  let clipService: MockClipService;
  let toast: MockToastService;
  let router: MockRouter;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ClipService, useClass: MockClipService },
        { provide: ToastService, useClass: MockToastService },
        { provide: Router, useClass: MockRouter },
        { provide: ActivatedRoute, useFactory: () => makeRoute('new') },
        ClipEditorComponent,
      ],
    });
    component = TestBed.inject(ClipEditorComponent);
    clipService = TestBed.inject(ClipService) as unknown as MockClipService;
    toast = TestBed.inject(ToastService) as unknown as MockToastService;
    router = TestBed.inject(Router) as unknown as MockRouter;
  });

  it('new clip isNew true and editingId null', () => {
    expect(component.isNew()).toBeTrue();
    expect(component.editingId()).toBeNull();
  });

  it('existing clip isNew false and loads', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ClipService, useClass: MockClipService },
        { provide: ToastService, useClass: MockToastService },
        { provide: Router, useClass: MockRouter },
        { provide: ActivatedRoute, useFactory: () => makeRoute('1') },
        ClipEditorComponent,
      ],
    });
    const comp = TestBed.inject(ClipEditorComponent);
    await new Promise((r) => setTimeout(r, 0));
    expect(comp.isNew()).toBeFalse();
    expect(comp.editingId()).toBe(1);
    expect(comp.form.title).toBe('T');
  });

  it('setType changes content type and defaults language', () => {
    component.form.language = '';
    component.setType('code');
    expect(component.form.contentType).toBe('code');
    expect(component.form.language).toBe('text');
  });

  it('setType keeps existing language', () => {
    component.form.language = 'python';
    component.setType('richtext');
    expect(component.form.language).toBe('python');
  });

  it('onExpiryChange 1day sets future expiresAt', () => {
    component.expiryPreset.set('1day');
    component.onExpiryChange();
    const expected = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    const actual = component.form.expiresAt!.slice(0, 19);
    expect(Math.abs(new Date(actual).getTime() - new Date(expected).getTime())).toBeLessThan(2000);
  });

  it('onExpiryChange empty clears expiresAt', () => {
    component.form.expiresAt = '2099-01-01T00:00:00.000Z';
    component.expiryPreset.set(null);
    component.onExpiryChange();
    expect(component.form.expiresAt).toBeNull();
  });

  it('goBack navigates to /app', () => {
    component.goBack();
    expect(router.navigate).toHaveBeenCalledWith(['/app']);
  });

  it('save creates a clip and navigates', async () => {
    component.form.title = 'New';
    component.form.content = 'hello';
    component.tagsInput = 'a, b , c';
    await component.save();
    expect(clipService.createClip).toHaveBeenCalled();
    const body = clipService.createClip.calls.mostRecent().args[0];
    expect(body.title).toBe('New');
    expect(body.tags).toEqual(['a', 'b', 'c']);
    expect(toast.success).toHaveBeenCalledWith('Clip created');
    expect(router.navigate).toHaveBeenCalledWith(['/app']);
  });

  it('save updates an existing clip', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: ClipService, useClass: MockClipService },
        { provide: ToastService, useClass: MockToastService },
        { provide: Router, useClass: MockRouter },
        { provide: ActivatedRoute, useFactory: () => makeRoute('1') },
        ClipEditorComponent,
      ],
    });
    const comp = TestBed.inject(ClipEditorComponent);
    await new Promise((r) => setTimeout(r, 0));
    comp.form.title = 'Edited';
    comp.tagsInput = '';
    await comp.save();
    expect(clipService.updateClip).toHaveBeenCalledWith(1, jasmine.objectContaining({ title: 'Edited' }));
    expect(toast.success).toHaveBeenCalledWith('Clip updated');
  });

  it('save surfaces errors via toast', async () => {
    clipService.createClip.and.returnValue(Promise.reject(new Error('boom')));
    component.form.title = 'x';
    component.form.content = 'y';
    await component.save();
    expect(toast.error).toHaveBeenCalledWith('boom');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
