import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
  styleUrl: './app.scss',
})
export class App {
  constructor(private readonly auth: AuthService, private readonly router: Router) {
    // Boot: only restore session if a token is present; otherwise go to login.
    if (this.auth.getToken()) {
      void this.auth.me().catch(() => {
        // me() will 401 if the session is stale; auth interceptor handles logout.
      });
    } else {
      void this.router.navigateByUrl('/login');
    }
  }
}
