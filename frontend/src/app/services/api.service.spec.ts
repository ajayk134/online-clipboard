import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService } from './api.service';
import { environment } from '../../environments/environment';

describe('ApiService', () => {
  let service: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ApiService],
    });
    service = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('GET should request the correct URL with JSON headers', async () => {
    const expected = { id: 1, title: 'T' };
    let got: unknown;
    service.get<{ id: number; title: string }>('/clips/1').then((r) => (got = r));

    const req = http.expectOne(`${environment.apiUrl}/clips/1`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Content-Type')).toBe('application/json');
    req.flush(expected);

    await Promise.resolve();
    expect(got).toEqual(expected);
  });

  it('POST should send body and return response', async () => {
    const expected = { token: 'abc', user: { id: 1, username: 'u', email: 'e@e.com', createdAt: 't' } };
    let got: unknown;
    service.post('/auth/register', { username: 'u', email: 'e@e.com', password: 'p1' }).then((r) => (got = r));

    const req = http.expectOne(`${environment.apiUrl}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'u', email: 'e@e.com', password: 'p1' });
    req.flush(expected);

    await Promise.resolve();
    expect(got).toEqual(expected);
  });

  it('query params are serialized and sent', async () => {
    service.get<{ items: unknown[]; total: number }>('/clips', {
      params: { q: 'hello', limit: '5', tag: 'js' },
    });
    const req = http.expectOne((r) =>
      r.url.startsWith(`${environment.apiUrl}/clips`) &&
      r.params.get('q') === 'hello' &&
      r.params.get('limit') === '5' &&
      r.params.get('tag') === 'js'
    );
    req.flush({ items: [], total: 0 });
  });

  it('blob responseType is used for export endpoints', async () => {
    service.get<Blob>('/clips/export', { responseType: 'blob' });
    const req = http.expectOne(`${environment.apiUrl}/clips/export`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['x'], { type: 'application/json' }));
  });

  it('HTTP error is surfaced as ApiError with statusCode', async () => {
    let err: unknown;
    service.get('/clips/999').catch((e) => (err = e));
    const req = http.expectOne(`${environment.apiUrl}/clips/999`);
    req.flush({ message: 'not found', error: 'not_found' }, { status: 404, statusText: 'Not Found' });
    await Promise.resolve();

    expect(err).toBeTruthy();
    const apiError = err as { message: string; statusCode?: number };
    expect(apiError.statusCode).toBe(404);
    expect(apiError.message).toContain('not found');
  });

  it('non-HttpErrorResponse errors carry the Error message', async () => {
    let err: unknown;
    service.get('/clips/1').catch((e) => (err = e));
    const req = http.expectOne(`${environment.apiUrl}/clips/1`);
    req.error(new ErrorEvent('boom'), { status: 0, statusText: 'Unknown Error' });
    await Promise.resolve();

    expect(err).toBeTruthy();
  });
});
