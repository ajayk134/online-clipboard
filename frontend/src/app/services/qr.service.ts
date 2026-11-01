import { Injectable } from '@angular/core';
import QRCode from 'qrcode';

@Injectable({ providedIn: 'root' })
export class QrService {
  async toDataUrl(text: string, size = 400): Promise<string> {
    return QRCode.toDataURL(text, { width: size, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } });
  }
}
