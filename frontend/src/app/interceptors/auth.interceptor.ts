import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();

  // Only attach the Authorization header to requests targeting our own API.
  // Never send the JWT to third-party origins, and never send an empty Bearer header.
  const isApiUrl = req.url.startsWith(environment.apiUrl) ||
    req.url.startsWith('/api') ||
    req.url.startsWith(environment.apiUrl.replace(/\/$/, ''));

  if (token && isApiUrl) {
    return next(req.clone({
      headers: req.headers.set('Authorization', `Bearer ${token}`),
    }));
  }

  return next(req);
};
