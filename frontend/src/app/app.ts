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
    // Boot: restore session; if logged in go to app, else login
    void this.auth.me().catch(() => {
      // me() will 401 if no session; that's fine
    });
  }
}
