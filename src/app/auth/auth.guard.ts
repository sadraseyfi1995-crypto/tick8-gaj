import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable, map, take } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class AuthGuard implements CanActivate {
    constructor(
        private authService: AuthService,
        private router: Router
    ) { }

    canActivate(): Observable<boolean | UrlTree> | boolean | UrlTree {
        if (this.authService.isAuthenticated()) {
            return true;
        }

        // Check async state
        return this.authService.isLoggedIn$.pipe(
            take(1),
            map(isLoggedIn => {
                if (isLoggedIn) {
                    return true;
                }
                return this.router.createUrlTree(['/login']);
            })
        );
    }
}
