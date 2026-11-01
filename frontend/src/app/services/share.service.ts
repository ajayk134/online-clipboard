import { inject, Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { ShareAccessResponse, ShareMeta } from '../models';

@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly api = inject(ApiService);

  async getMeta(token: string): Promise<ShareMeta> {
    return this.api.get<ShareMeta>(`/share/${token}/meta`);
  }

  async access(token: string, password?: string | null): Promise<ShareAccessResponse> {
    return this.api.post<ShareAccessResponse>(`/share/${token}/access`, { password });
  }
}
