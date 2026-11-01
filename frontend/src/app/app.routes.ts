import { Routes } from '@angular/router';
import { AuthViewComponent } from './components/auth-view.component';
import { ClipListComponent } from './components/clip-list.component';
import { ClipEditorComponent } from './components/clip-editor.component';
import { ClipDetailComponent } from './components/clip-detail.component';
import { ShareViewComponent } from './components/share-view.component';
import { LayoutComponent } from './components/layout.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/app', pathMatch: 'full' },
  { path: 'login', component: AuthViewComponent },
  { path: 'register', component: AuthViewComponent },
  {
    path: 'app',
    component: LayoutComponent,
    canMatch: [authGuard],
    children: [
      { path: '', redirectTo: 'clips', pathMatch: 'full' },
      { path: 'clips', component: ClipListComponent },
      { path: 'editor', component: ClipEditorComponent },
      { path: 'editor/:id', component: ClipEditorComponent },
      { path: 'detail/:id', component: ClipDetailComponent },
    ],
  },
  { path: 's/:token', component: ShareViewComponent },
  { path: '**', redirectTo: '/app' },
];
