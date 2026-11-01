import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpRequest,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';
import { environment } from '../../environments/environment';

class MockAuthService {
  getToken = jasmine.createSpy('getToken').and.returnValue('fake-token');
  logout = jasmine.createSpy('logout').and.returnValue(Promise.resolve());
}

class MockToastService {
  error = jasmine.createSpy('error');
}

class MockRouter {
  url = '/app';
  navigateByUrl = jasmine.createSpy('navigateByUrl').and.returnValue(Promise.resolve(true));
}

describe('authInterceptor', () => {
  let http: HttpTestingController;
  let auth: MockAuthService;

  beforeEach(() => {
    auth = new MockAuthService();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('attaches Bearer token to same-origin API requests', async () => {
    const client = TestBed.inject(HttpClient);
    let headers: string | null = null;
    client.get(`${environment.apiUrl}/clips`).subscribe({
      next: () => {},
      error: () => {},
    });
    const req = http.expectOne((r: HttpRequest<unknown>) =>
      r.url === `${environment.apiUrl}/clips`,
    );
    headers = req.request.headers.get('Authorization');
    req.flush({ items: [], total: 0 });
    await new Promise((r) => setTimeout(r, 0));
    expect(headers).toBe('Bearer fake-token');
  });

  it('does not attach token to non-API relative URLs', async () => {
    const client = TestBed.inject(HttpClient);
    let headers: string | null = null;
    client.get('/assets/config.json').subscribe({
      next: () => {},
      error: () => {},
    });
    const req = http.expectOne((r: HttpRequest<unknown>) =>
      r.url === '/assets/config.json',
    );
    headers = req.request.headers.get('Authorization');
    req.flush({});
    await new Promise((r) => setTimeout(r, 0));
    expect(headers).toBeNull();
  });

  it('does not attach token to third-party origins', async () => {
    const client = TestBed.inject(HttpClient);
    let headers: string | null = null;
    client.get('https://evil.example.com/steal').subscribe({
      next: () => {},
      error: () => {},
    });
    const req = http.expectOne((r: HttpRequest<unknown>) =>
      r.url === 'https://evil.example.com/steal',
    );
    headers = req.request.headers.get('Authorization');
    req.flush({});
    await new Promise((r) => setTimeout(r, 0));
    expect(headers).toBeNull();
  });

  it('does not send empty Bearer header when no token', async () => {
    auth.getToken = jasmine.createSpy('getToken').and.returnValue(null);
    const client = TestBed.inject(HttpClient);
    let headers: string | null = null;
    client.get(`${environment.apiUrl}/clips`).subscribe({
      next: () => {},
      error: () => {},
    });
    const req = http.expectOne((r: HttpRequest<unknown>) =>
      r.url === `${environment.apiUrl}/clips`,
    );
    headers = req.request.headers.get('Authorization');
    req.flush({ items: [], total: 0 });
    await new Promise((r) => setTimeout(r, 0));
    expect(headers).toBeNull();
  });
});

describe('errorInterceptor', () => {
  let http: HttpTestingController;
  let auth: MockAuthService;
  let toast: MockToastService;
  let router: MockRouter;

  beforeEach(() => {
    auth = new MockAuthService();
    toast = new MockToastService();
    router = new MockRouter();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: ToastService, useValue: toast },
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('shows toast and navigates to login on 401', async () => {
    const client = TestBed.inject(HttpClient);
    client.get('/clips/1').subscribe({ error: () => {} });
    const req = http.expectOne('/clips/1');
    req.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await new Promise((r) => setTimeout(r, 0));
    expect(auth.logout).toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('does not call logout again when the failing request is logout itself', async () => {
    const client = TestBed.inject(HttpClient);
    client.post('/auth/logout', {}).subscribe({ error: () => {} });
    const req = http.expectOne('/auth/logout');
    req.flush({ error: 'unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    await new Promise((r) => setTimeout(r, 0));
    expect(auth.logout).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('returns friendly message for connection errors (status 0)', async () => {
    const client = TestBed.inject(HttpClient);
    client.get('/clips/1').subscribe({ error: () => {} });
    const req = http.expectOne('/clips/1');
    req.error(new ErrorEvent('failed'), { status: 0, statusText: 'Unknown Error' });
    await new Promise((r) => setTimeout(r, 0));
    expect(toast.error).toHaveBeenCalledWith(
      'Unable to reach the server. Please check your connection.',
    );
  });
});
