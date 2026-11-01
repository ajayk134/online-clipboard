export interface User {
  id: number;
  username: string;
  email: string;
  createdAt: string;
}

export interface AuthTokens {
  token: string;
  user: User;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export type ContentType = 'text' | 'richtext' | 'code';

export interface Clip {
  id: number;
  user_id: number;
  title: string;
  content: string;
  excerpt: string;
  contentType: ContentType;
  language: string;
  tags: string[];
  isPinned: boolean;
  isFavorite: boolean;
  copyCount: number;
  viewCount: number;
  shareToken: string | null;
  shareEnabled: boolean;
  expiresAt: string | null;
  isOneTime: boolean;
  readCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClipListResponse {
  items: Clip[];
  total: number;
}

export interface ClipQueryParams {
  q?: string;
  tag?: string;
  favorite?: boolean;
  pinned?: boolean;
  type?: ContentType;
  sort?: string;
  limit?: number;
  offset?: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface TagsResponse {
  tags: TagCount[];
}

export interface StatsResponse {
  total: number;
  favorites: number;
  pinned: number;
  copies: number;
  views: number;
  shared: number;
}

export interface CreateClipRequest {
  title: string;
  content: string;
  contentType: ContentType;
  language?: string;
  tags?: string[];
  isPinned?: boolean;
  isFavorite?: boolean;
  expiresAt?: string | null;
  share?: boolean;
  sharePassword?: string | null;
  shareOneTime?: boolean;
}

export interface UpdateClipRequest {
  title?: string;
  content?: string;
  contentType?: ContentType;
  language?: string;
  tags?: string[];
  isPinned?: boolean;
  isFavorite?: boolean;
  expiresAt?: string | null;
  share?: boolean;
  sharePassword?: string | null;
  shareOneTime?: boolean;
}

export interface FlagsRequest {
  isFavorite?: boolean;
  isPinned?: boolean;
}

export interface ShareClipRequest {
  enabled?: boolean;
  oneTime?: boolean;
  rotate?: boolean;
  password?: string | null;
  clearPassword?: boolean;
}

export interface ShareMeta {
  title: string;
  contentType: ContentType;
  language: string;
  hasPassword: boolean;
  isOneTime: boolean;
  available: boolean;
  expired: boolean;
  expiresAt: string | null;
  createdAt: string;
  excerpt: string;
}

export interface ShareAccessResponse {
  title: string;
  content: string;
  contentType: ContentType;
  language: string;
  consumed: boolean;
  expiresAt: string | null;
}

export interface ApiError {
  message: string;
  statusCode?: number;
  errors?: Record<string, string[]>;
}
