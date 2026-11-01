import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { ApiService } from './api.service';
import { Router } from '@angular/router';
import {
  AuthTokens,
  User,
} from '../models';

class MockApiService {
  post = jasmine.createSpyObj('post', ['post']) as unknown as {
    post<T>(url: string, body?: unknown): Promise<T>;
  };
  get = jasmine.createSpyObj('get', ['get']) as unknown as {
    get<T>(url: string): Promise<T>;
  };
  put = jasmine.createSpyObj('put', ['put']) as unknown as {
    put<T>(url: string, body?: unknown): Promise<T>;
  };
}

class MockRouter {
  navigateByUrl = jasmine.createSpy('navigateByUrl').and.returnValue(Promise.resolve(true));
}

describe('AuthService', () => {
  let service: AuthService;
  let api: MockApiService;
  let router: MockRouter;

  const user: User = {
    id: 1,
    username: 'alice',
    email: 'alice@example.com',
    createdAt: '2024-01-01T00:00:00Z',
  };
  const tokens: AuthTokens = { token: 'tok-abc', user };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useClass: MockApiService },
        { provide: Router, useClass: MockRouter },
        AuthService,
      ],
    });
    service = TestBed.inject(AuthService);
    api = TestBed.inject(ApiService) as unknown as MockApiService;
    router = TestBed.inject(Router) as unknown as MockRouter;
    spyOn(localStorage, 'getItem').and.callThrough();
    spyOn(localStorage, 'setItem').and.callThrough();
    spyOn(localStorage, 'removeItem').and.callThrough();
  });

  it('login stores session and returns tokens', async () => {
    api.post = jasmine.createSpy('post').and.returnValue(Promise.resolve(tokens));
    const res = await service.login('alice', 'pw');
    expect(api.post).toHaveBeenCalledWith('/auth/login', { identifier: 'alice', password: 'pw' });
    expect(res).toBe(tokens);
    expect(service.isLoggedIn()).toBeTrue();
    expect(service.getToken()).toBe('tok-abc');
    expect(service.getUser()).toEqual(user);
    expect(localStorage.setItem).toHaveBeenCalledWith('oc_token', 'tok-abc');
    expect(localStorage.setItem).toHaveBeenCalledWith('oc_user', JSON.stringify(user));
  });

  it('register stores session and returns tokens', async () => {
    api.post = jasmine.createSpy('post').and.returnValue(Promise.resolve(tokens));
    const res = await service.register('alice', 'alice@example.com', 'S3cure-pass!');
    expect(api.post).toHaveBeenCalledWith('/auth/register', {
      username: 'alice',
      email: 'alice@example.com',
      password: 'S3cure-pass!',
    });
    expect(res).toBe(tokens);
    expect(service.isLoggedIn()).toBeTrue();
  });

  it('me updates and caches user', async () => {
    api.get = jasmine.createSpy('get').and.returnValue(Promise.resolve(user));
    const res = await service.me();
    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(res).toBe(user);
    expect(service.getUser()).toBe(user);
  });

  it('logout clears session and navigates to login', async () => {
    api.post = jasmine.createSpy('post').and.returnValue(Promise.resolve({ message: 'ok' }));
    service.setSession('tok-abc', user);
    await service.logout();
    expect(api.post).toHaveBeenCalledWith('/auth/logout');
    expect(service.isLoggedIn()).toBeFalse();
    expect(service.getToken()).toBeNull();
    expect(localStorage.removeItem).toHaveBeenCalledWith('oc_token');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('logout still clears session when the API call fails', async () => {
    api.post = jasmine.createSpy('post').and.returnValue(Promise.reject(new Error('down')));
    service.setSession('tok-abc', user);
    await service.logout();
    expect(service.isLoggedIn()).toBeFalse();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('changePassword updates session with new token', async () => {
    const updated: User = { ...user, username: 'alice' };
    const resp = { token: 'tok-new', message: 'changed' };
    api.put = jasmine.createSpy('put').and.returnValue(Promise.resolve(resp));
    service.setSession('tok-abc', user);
    const res = await service.changePassword('cur-pass-1', 'S3cure-pass-2');
    expect(api.put).toHaveBeenCalledWith('/auth/password', {
      currentPassword: 'cur-pass-1',
      newPassword: 'S3cure-pass-2',
    });
    expect(res).toBe(resp);
    expect(service.getToken()).toBe('tok-new');
  });
});
