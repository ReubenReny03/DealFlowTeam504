import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import {
  INTERNAL_NAV,
  LANDING_ROUTE,
  Role,
  type AuthSessionDto,
  type DemoAccountDto,
  type UserDto,
} from '@dealflow/shared';
import { ApiService } from '../api/api.service';

const STORAGE_KEY = 'dealflow360.session';

interface StoredSession {
  token: string;
  expiresAt: string;
  user: UserDto;
  portalToken?: string;
  portalQuotationId?: string;
}

/**
 * Who is signed in, what they may see, and how the app gets their token onto
 * every request. Signal-based: components read `user()`, `role()`, `nav()` and
 * re-render automatically.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly state = signal<StoredSession | null>(readStorage());

  readonly user = computed(() => this.state()?.user ?? null);
  readonly token = computed(() => this.state()?.token ?? null);
  readonly portalToken = computed(() => this.state()?.portalToken ?? null);
  readonly portalQuotationId = computed(() => this.state()?.portalQuotationId ?? null);
  readonly role = computed<Role | null>(() => this.state()?.user.role ?? null);
  readonly isAuthenticated = computed(() => {
    const s = this.state();
    return !!s && new Date(s.expiresAt).getTime() > Date.now();
  });
  readonly isInternal = computed(() => {
    const role = this.role();
    return !!role && role !== Role.CUSTOMER;
  });
  readonly initials = computed(() => {
    const name = this.user()?.name ?? '';
    return name.split(/[\s.]+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  });

  /** Top navigation, filtered to what this role is actually allowed to open. */
  readonly nav = computed(() => {
    const role = this.role();
    if (!role) return [];
    return INTERNAL_NAV.filter((item) => item.roles.includes(role));
  });

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly demoAccounts = signal<DemoAccountDto[]>([]);

  async login(email: string, password: string): Promise<UserDto> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const session = await firstValueFrom(this.api.post<AuthSessionDto>('/auth/login', { email, password }));
      this.persist({
        token: session.token,
        expiresAt: session.expiresAt,
        user: session.user,
        portalQuotationId: session.portalQuotationId,
      });
      return session.user;
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Email or password is incorrect.');
      throw err;
    } finally {
      this.loading.set(false);
    }
  }

  async loadDemoAccounts(): Promise<void> {
    try {
      this.demoAccounts.set(await firstValueFrom(this.api.get<DemoAccountDto[]>('/auth/demo-accounts')));
    } catch {
      this.demoAccounts.set([]);
    }
  }

  /** A customer arriving through a magic link has a token but no password login. */
  setPortalToken(token: string): void {
    const current = this.state();
    this.persist({
      token: current?.token ?? '',
      expiresAt: current?.expiresAt ?? new Date(Date.now() + 86_400_000).toISOString(),
      user:
        current?.user ??
        ({ id: 'portal', name: 'Guest', email: '', role: Role.CUSTOMER, active: true, landingRoute: '/portal', createdAt: '', updatedAt: '' } as UserDto),
      portalToken: token,
      portalQuotationId: current?.portalQuotationId,
    });
  }

  landingRoute(): string {
    const role = this.role();
    return role ? LANDING_ROUTE[role] : '/login';
  }

  logout(redirect = true): void {
    this.state.set(null);
    localStorage.removeItem(STORAGE_KEY);
    if (redirect) void this.router.navigate(['/login']);
  }

  private persist(session: StoredSession): void {
    this.state.set(session);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  }
}

function readStorage(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (new Date(parsed.expiresAt).getTime() <= Date.now() && !parsed.portalToken) return null;
    return parsed;
  } catch {
    return null;
  }
}
