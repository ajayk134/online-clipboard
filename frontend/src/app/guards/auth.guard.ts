import { inject } from '@angular/core';
import { CanMatchFn, Route, UrlSegment } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanMatchFn = (
  route: Route,
  segments: UrlSegment[]
) => {
  const auth = inject(AuthService);
  if (auth.isLoggedIn()) return true;
  auth.logout();
  return false;
};
