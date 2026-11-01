import { inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import {
  Clip,
  ClipListResponse,
  ClipQueryParams,
  CreateClipRequest,
  FlagsRequest,
  ShareClipRequest,
  StatsResponse,
  TagsResponse,
  UpdateClipRequest,
} from '../models';

@Injectable({ providedIn: 'root' })
export class ClipService {
  private readonly api = inject(ApiService);

  readonly clips = signal<Clip[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly stats = signal<StatsResponse | null>(null);
  readonly tags = signal<{ tag: string; count: number }[]>([]);

  async getClips(params: ClipQueryParams = {}): Promise<ClipListResponse> {
    this.loading.set(true);
    try {
      const res = await this.api.get<ClipListResponse>('/clips', {
        params: {
          q: params.q ?? '',
          tag: params.tag ?? '',
          favorite: String(params.favorite ?? ''),
          pinned: String(params.pinned ?? ''),
          type: params.type ?? '',
          sort: params.sort ?? '',
          limit: String(params.limit ?? 20),
          offset: String(params.offset ?? 0),
        },
      });
      this.clips.set(res.items);
      this.total.set(res.total);
      return res;
    } finally {
      this.loading.set(false);
    }
  }

  async getClip(id: number): Promise<Clip> {
    return this.api.get<Clip>(`/clips/${id}`);
  }

  async createClip(body: CreateClipRequest): Promise<Clip> {
    return this.api.post<Clip>('/clips', body);
  }

  async updateClip(id: number, body: UpdateClipRequest): Promise<Clip> {
    return this.api.patch<Clip>(`/clips/${id}`, body);
  }

  async deleteClip(id: number): Promise<void> {
    await this.api.delete<void>(`/clips/${id}`);
  }

  async copyClip(id: number): Promise<{ ok: boolean }> {
    return this.api.patch<{ ok: boolean }>(`/clips/${id}/copy`);
  }

  async toggleFlags(id: number, body: FlagsRequest): Promise<Clip> {
    return this.api.patch<Clip>(`/clips/${id}/flags`, body);
  }

  async shareClip(id: number, body: ShareClipRequest): Promise<Clip> {
    return this.api.post<Clip>(`/clips/${id}/share`, body);
  }

  async getQr(id: number): Promise<Blob> {
    return this.api.get<Blob>(`/clips/${id}/qr`, { responseType: 'blob' });
  }

  async exportClip(id: number, format: 'txt' | 'html' | 'md'): Promise<Blob> {
    return this.api.get<Blob>(`/clips/${id}/export`, {
      params: { format },
      responseType: 'blob',
    });
  }

  async exportAll(): Promise<Blob> {
    return this.api.get<Blob>('/clips/export', { responseType: 'blob' });
  }

  async importClips(items: unknown[]): Promise<{ imported: number; errors: unknown[] }> {
    return this.api.post<{ imported: number; errors: unknown[] }>('/clips/import', { items });
  }

  async getTags(): Promise<TagsResponse> {
    const res = await this.api.get<TagsResponse>('/clips/tags');
    this.tags.set(res.tags);
    return res;
  }

  async getStats(): Promise<StatsResponse> {
    const res = await this.api.get<StatsResponse>('/clips/stats');
    this.stats.set(res);
    return res;
  }
}
