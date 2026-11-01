import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'expiryLabel', standalone: true })
export class ExpiryLabelPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return 'Never expires';
    const date = new Date(value);
    const now = new Date();
    if (date <= now) return 'Expired';
    const days = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 1) return 'Expires in 1 day';
    if (days < 30) return `Expires in ${days} days`;
    return `Expires ${date.toLocaleDateString()}`;
  }
}
