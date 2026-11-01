import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();
  const headers = req.headers.set(
    'Authorization',
    token ? `Bearer ${token}` : ''
  );
  return next(req.clone({ headers }));
};
