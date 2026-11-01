import { inject, Injectable } from '@angular/core';
import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';
import { catchError, delay, retry, throwError, type Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiError } from '../models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  private headers(): HttpHeaders {
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });
    return headers;
  }

  private handleError = (error: unknown): Observable<never> => {
    const apiError: ApiError = {
      message: 'An unexpected error occurred',
    };
    if (error instanceof HttpErrorResponse) {
      apiError.statusCode = error.status;
      apiError.message =
        error.error?.message ||
        error.error?.error ||
        `HTTP ${error.status}` ||
        'An unexpected error occurred';
      if (error.error?.errors) {
        apiError.errors = error.error.errors;
      }
    } else if (error instanceof Error) {
      apiError.message = error.message;
    }
    return throwError(() => apiError);
  };

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
    options?: { params?: Record<string, string | number>; responseType?: 'json' | 'blob' }
  ): Promise<T> {
    const fullUrl = `${this.baseUrl}${url}`;
    const httpOptions: Record<string, unknown> = {
      headers: this.headers(),
      responseType: options?.responseType === 'blob' ? 'blob' as const : ('json' as const),
    };

    if (options?.params) {
      let params = new HttpParams();
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined && value !== null) {
          params = params.set(key, String(value));
        }
      }
      httpOptions['params'] = params;
    }

    const obs = (() => {
      switch (method) {
        case 'GET':
          return this.http.get<T>(fullUrl, httpOptions);
        case 'POST':
          return this.http.post<T>(fullUrl, body, httpOptions);
        case 'PUT':
          return this.http.put<T>(fullUrl, body, httpOptions);
        case 'PATCH':
          return this.http.patch<T>(fullUrl, body, httpOptions);
        case 'DELETE':
          return this.http.delete<T>(fullUrl, httpOptions);
      }
    })();

    return firstValueFrom(obs.pipe(retry(1), catchError(this.handleError)));
  }

  get<T>(url: string, options?: { params?: Record<string, string | number>; responseType?: 'json' | 'blob' }): Promise<T> {
    return this.request<T>('GET', url, undefined, options);
  }

  post<T>(url: string, body?: unknown, options?: { params?: Record<string, string | number>; responseType?: 'json' | 'blob' }): Promise<T> {
    return this.request<T>('POST', url, body, options);
  }

  put<T>(url: string, body?: unknown, options?: { params?: Record<string, string | number>; responseType?: 'json' | 'blob' }): Promise<T> {
    return this.request<T>('PUT', url, body, options);
  }

  patch<T>(url: string, body?: unknown, options?: { params?: Record<string, string | number>; responseType?: 'json' | 'blob' }): Promise<T> {
    return this.request<T>('PATCH', url, body, options);
  }

  delete<T>(url: string, options?: { params?: Record<string, string | number>; responseType?: 'json' | 'blob' }): Promise<T> {
    return this.request<T>('DELETE', url, undefined, options);
  }
}
