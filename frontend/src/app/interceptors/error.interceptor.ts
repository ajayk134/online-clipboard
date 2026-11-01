import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, Observable, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const errorInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let message = 'An unexpected error occurred';

      if (error.status === 0) {
        message = 'Unable to reach the server. Please check your connection.';
      } else if (error.status === 401) {
        // Avoid a recursive logout loop: if the failing request is the logout
        // endpoint itself, just clear the client session without calling the API again.
        const isLogout = req.url.endsWith('/auth/logout');
        if (!isLogout && auth.getToken()) {
          auth.logout();
        }
        message = 'Your session has expired. Please sign in again.';
        if (!router.url.startsWith('/login')) {
          router.navigateByUrl('/login');
        }
      } else if (error.status === 403) {
        message = 'You do not have permission to perform this action.';
      } else if (error.status === 404) {
        message = 'The requested resource was not found.';
      } else if (error.status === 429) {
        message = 'Too many requests. Please try again later.';
      } else if (error.status >= 500) {
        message = 'Server error. Please try again later.';
      } else if (error.error?.message) {
        message = error.error.message;
      } else if (error.error?.error) {
        message = error.error.error;
      }

      toast.error(message);
      return throwError(() => error);
    })
  );
};
