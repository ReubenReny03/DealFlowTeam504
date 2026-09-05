import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  ALL_ROLES,
  EMPTY_STATES,
  INTERNAL_ROLES,
  ROLE_LABEL,
  Role,
  type CreateUserRequest,
  type CustomerDto,
  type UpdateUserRequest,
  type UserListDto,
  type UserRowDto,
} from '@dealflow/shared';
import { ApiService } from '../../core/api/api.service';
import { ListQuery } from '../../core/state/list-query';
import { SessionStore } from '../../core/state/session.store';
import { ToastStore } from '../../core/state/toast.store';
import {
  EmptyStateComponent,
  ErrorStateComponent,
  LoadingComponent,
  ModalComponent,
  PaginatorComponent,
  SearchBoxComponent,
} from '../../shared/ui';

/**
 * Screen 19 — Users.
 *
 * The only place an account comes into existence, now that the public signup is
 * gone. The role picker is the whole screen: an internal role opens the sales
 * workspace, and CUSTOMER makes the account a portal login, which is why picking
 * it reveals a required company. That company is fixed for the account's life —
 * a portal login can only ever open its own company's quotations.
 */
@Component({
  selector: 'df-users',
  standalone: true,
  imports: [
    FormsModule,
    LoadingComponent,
    ErrorStateComponent,
    EmptyStateComponent,
    ModalComponent,
    PaginatorComponent,
    SearchBoxComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="df-h1">Users</h1>
        <p class="df-muted mt-1">
          Every account is created here — there is no public signup. An internal account opens the
          sales workspace; a customer account is a portal login scoped to one company.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <df-search-box
          [value]="query.q()"
          placeholder="Search name or email"
          width="16rem"
          (search)="search($event)"
        />
        <select class="df-input !w-44" [ngModel]="roleFilter()" (ngModelChange)="filterByRole($event)">
          <option value="">All roles</option>
          @for (r of roles; track r) {
            <option [value]="r">{{ roleLabel[r] }}</option>
          }
        </select>
        <button type="button" class="df-btn-primary" (click)="newUser()">+ New User</button>
      </div>
    </div>

    @if (loading()) {
      <div class="mt-6"><df-loading [count]="4" label="Loading users" /></div>
    } @else if (error()) {
      <div class="mt-6"><df-error-state [message]="error()!" (retry)="load()" /></div>
    } @else if (!users().length) {
      <div class="mt-6">
        <df-empty-state
          icon="👤"
          [title]="empty.title"
          [body]="empty.body"
          [cta]="empty.cta ?? null"
          [filtered]="query.isFiltered() || !!roleFilter()"
          [searchTerm]="query.q()"
          (action)="newUser()"
          (clearSearch)="clearFilters()"
        />
      </div>
    } @else {
      <div class="df-card df-scroll-x mt-6">
        <table class="min-w-full divide-y divide-slate-200">
          <thead class="bg-slate-50">
            <tr>
              <th class="df-th">Name</th>
              <th class="df-th">Email</th>
              <th class="df-th">Role</th>
              <th class="df-th">Company</th>
              <th class="df-th">Status</th>
              <th class="df-th"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            @for (u of users(); track u.id) {
              <tr [class]="u.active ? '' : 'bg-slate-50/60'">
                <td class="df-td font-medium text-slate-800">
                  {{ u.name }}
                  @if (u.id === session.user()?.id) {
                    <span class="df-chip ml-1 border-brand-200 bg-brand-50 text-brand-700">you</span>
                  }
                </td>
                <td class="df-td font-mono text-xs text-slate-500">{{ u.email }}</td>
                <td class="df-td text-slate-700">{{ roleLabel[u.role] }}</td>
                <td class="df-td text-slate-600">
                  @if (u.role === customerRole) {
                    {{ u.customerName || '—' }}
                  } @else {
                    <span class="text-slate-300">internal</span>
                  }
                </td>
                <td class="df-td">
                  <span
                    class="df-chip"
                    [class]="
                      u.active
                        ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                        : 'border-slate-200 bg-slate-100 text-slate-500'
                    "
                  >
                    {{ u.active ? 'Active' : 'Deactivated' }}
                  </span>
                  @if (u.mustChangePassword) {
                    <span
                      class="df-chip ml-1 border-amber-200 bg-amber-100 text-amber-800"
                      title="Still on the password it was created with"
                      >new password pending</span
                    >
                  }
                </td>
                <td class="df-td text-right">
                  <div class="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      class="text-sm font-medium text-brand-700 hover:text-brand-800"
                      (click)="edit(u)"
                    >
                      Edit
                    </button>
                    @if (u.id !== session.user()?.id) {
                      <button
                        type="button"
                        class="text-sm font-medium"
                        [class]="u.active ? 'text-rose-600 hover:text-rose-700' : 'text-brand-700 hover:text-brand-800'"
                        [disabled]="busyId() === u.id"
                        (click)="toggleActive(u)"
                      >
                        {{ busyId() === u.id ? 'Saving…' : u.active ? 'Deactivate' : 'Reactivate' }}
                      </button>
                    }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <df-paginator
        [page]="query.page()"
        [pageSize]="query.pageSize()"
        [total]="query.total()"
        (go)="goToPage($event)"
      />
      <p class="mt-3 text-xs leading-relaxed text-slate-400">
        Deactivating takes effect on the account's very next request — the API re-reads the account
        on every call rather than trusting a token that was already issued.
      </p>
    }

    <df-modal
      [open]="createOpen()"
      title="New user"
      subtitle="They can sign in as soon as the account is active."
      (close)="createOpen.set(false)"
    >
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="block sm:col-span-2">
          <span class="df-label">Full name</span>
          <input class="df-input" [(ngModel)]="draft.name" placeholder="e.g. A. Verma" />
        </label>
        <label class="block">
          <span class="df-label">Email</span>
          <input class="df-input" type="email" [(ngModel)]="draft.email" placeholder="name@company.test" />
        </label>
        <label class="block">
          <span class="df-label">Temporary password</span>
          <input class="df-input" type="text" [(ngModel)]="draft.password" />
          <span class="mt-1 block text-xs text-slate-400">At least 6 characters. Share it with them directly.</span>
        </label>
        <label class="block sm:col-span-2">
          <span class="df-label">Role</span>
          <select class="df-input" [(ngModel)]="draft.role">
            @for (r of roles; track r) {
              <option [value]="r">{{ roleLabel[r] }}</option>
            }
          </select>
          @if (isCustomer()) {
            <span class="mt-1 block text-xs text-slate-400">
              A customer account is a portal login. It never reaches the sales workspace.
            </span>
          } @else {
            <span class="mt-1 block text-xs text-slate-400">{{ roleHint() }}</span>
          }
        </label>

        <!-- A portal login is scoped to exactly one company, for its whole life. -->
        @if (isCustomer()) {
          <label class="block sm:col-span-2">
            <span class="df-label">Company</span>
            @if (customers().length) {
              <select class="df-input" [(ngModel)]="draft.customerId">
                <option value="">Select a company…</option>
                @for (c of customers(); track c.id) {
                  <option [value]="c.id">{{ c.name }}</option>
                }
              </select>
              <span class="mt-1 block text-xs text-slate-400">
                This account will only ever open this company's quotations. It cannot be changed to a
                different kind of account later.
              </span>
            } @else {
              <p class="mt-1 text-sm text-slate-500">
                There are no active customers yet, so there is nothing to attach a portal login to.
              </p>
            }
          </label>
        }
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" class="df-btn-ghost" (click)="createOpen.set(false)">Cancel</button>
        <button type="button" class="df-btn-primary" [disabled]="saving() || !canSubmit()" (click)="create()">
          {{ saving() ? 'Creating…' : 'Create user' }}
        </button>
      </div>
    </df-modal>

    <df-modal
      [open]="!!editing()"
      title="Edit user"
      [subtitle]="editing()?.email ?? ''"
      (close)="editing.set(null)"
    >
      @if (editing(); as target) {
        <div class="grid gap-3 sm:grid-cols-2">
          <label class="block sm:col-span-2">
            <span class="df-label">Full name</span>
            <input class="df-input" [(ngModel)]="editDraft.name" />
          </label>
          <label class="block sm:col-span-2">
            <span class="df-label">Email</span>
            <input class="df-input" type="email" [(ngModel)]="editDraft.email" />
          </label>

          <!-- A portal login and an internal user are different kinds of account,
               so the role picker only offers the internal ones and only to an
               internal user. Moving a contact between companies is fine. -->
          @if (target.role === customerRole) {
            <label class="block sm:col-span-2">
              <span class="df-label">Company</span>
              @if (customers().length) {
                <select class="df-input" [(ngModel)]="editDraft.customerId">
                  @for (c of customers(); track c.id) {
                    <option [value]="c.id">{{ c.name }}</option>
                  }
                </select>
                <span class="mt-1 block text-xs text-slate-400">
                  Moving this login changes which company's quotations it can open.
                </span>
              } @else {
                <p class="mt-1 text-sm text-slate-500">Loading companies…</p>
              }
            </label>
          } @else {
            <label class="block sm:col-span-2">
              <span class="df-label">Role</span>
              <select class="df-input" [(ngModel)]="editDraft.role">
                @for (r of internalRoles; track r) {
                  <option [value]="r">{{ roleLabel[r] }}</option>
                }
              </select>
              <span class="mt-1 block text-xs text-slate-400">
                An internal user cannot become a portal login, or the reverse — create a new
                account instead.
              </span>
            </label>
          }

          <label class="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300"
              [(ngModel)]="editDraft.resetPassword"
            />
            <span class="text-sm text-slate-700">Set a new password for them</span>
          </label>
          @if (editDraft.resetPassword) {
            <label class="block sm:col-span-2">
              <span class="df-label">New password</span>
              <input class="df-input" type="text" [(ngModel)]="editDraft.password" />
              <span class="mt-1 block text-xs text-slate-400">
                At least 6 characters. They will be asked to choose their own at their next sign-in.
              </span>
            </label>
          }

          <label class="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              class="h-4 w-4 rounded border-slate-300"
              [(ngModel)]="editDraft.active"
              [disabled]="target.id === session.user()?.id"
            />
            <span class="text-sm text-slate-700">
              Account is active
              @if (target.id === session.user()?.id) {
                <span class="text-xs text-slate-400">— you cannot deactivate yourself</span>
              }
            </span>
          </label>
        </div>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="df-btn-ghost" (click)="editing.set(null)">Cancel</button>
          <button
            type="button"
            class="df-btn-primary"
            [disabled]="saving() || !canSaveEdit()"
            (click)="saveEdit()"
          >
            {{ saving() ? 'Saving…' : 'Save changes' }}
          </button>
        </div>
      }
    </df-modal>
  `,
})
export class UsersPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastStore);
  protected readonly session = inject(SessionStore);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly users = signal<UserRowDto[]>([]);
  protected readonly customers = signal<CustomerDto[]>([]);
  protected readonly empty = EMPTY_STATES['users'];
  protected readonly query = new ListQuery(25);
  protected readonly roleFilter = signal<string>('');

  protected readonly createOpen = signal(false);
  protected readonly editing = signal<UserRowDto | null>(null);
  protected readonly saving = signal(false);
  protected readonly busyId = signal<string | null>(null);
  protected readonly internalRoles = INTERNAL_ROLES;

  protected readonly roleLabel = ROLE_LABEL;
  protected readonly roles = ALL_ROLES;
  protected readonly customerRole = Role.CUSTOMER;

  draft = emptyDraft();
  editDraft = emptyEditDraft();

  protected readonly isCustomer = computed(() => this.draft.role === Role.CUSTOMER);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const { data, meta } = await firstValueFrom(
        this.api.getWithMeta<UserListDto>('/users', {
          ...this.query.params(),
          ...(this.roleFilter() ? { role: this.roleFilter() } : {}),
        }),
      );
      this.users.set(data.items);
      this.query.applyMeta(meta, data.items.length);
    } catch (err: any) {
      this.error.set(err?.error?.error?.message ?? 'Could not load the user list.');
    } finally {
      this.loading.set(false);
    }
  }

  search(term: string): void {
    if (this.query.setSearch(term)) void this.load();
  }
  goToPage(page: number): void {
    if (this.query.goToPage(page)) void this.load();
  }
  filterByRole(role: string): void {
    this.roleFilter.set(role);
    this.query.page.set(1);
    void this.load();
  }
  clearFilters(): void {
    this.roleFilter.set('');
    this.query.setSearch('');
    void this.load();
  }

  /** What each internal role can actually do, so the picker is not a guess. */
  roleHint(): string {
    return (
      {
        [Role.ADMIN]: 'Configures the catalogue, ceilings and accounts. Can act on any approval step.',
        [Role.SALES_REP]: 'Builds and submits quotations for their own customers.',
        [Role.SALES_MANAGER]: 'First approver on anything over a discount ceiling.',
        [Role.FINANCE]: 'Second approver on high-risk quotes; records payments and billing.',
        [Role.CUSTOMER]: '',
      }[this.draft.role] ?? ''
    );
  }

  canSubmit(): boolean {
    const ready = this.draft.name.trim().length >= 2 && !!this.draft.email.trim() && this.draft.password.length >= 6;
    return ready && (!this.isCustomer() || !!this.draft.customerId);
  }

  newUser(): void {
    this.draft = emptyDraft();
    this.createOpen.set(true);
    if (!this.customers().length) void this.loadCustomers();
  }

  private async loadCustomers(): Promise<void> {
    try {
      const list = await firstValueFrom(this.api.get<CustomerDto[]>('/customers'));
      this.customers.set((list ?? []).filter((c) => c.active));
    } catch {
      // Only the CUSTOMER branch needs these; the form says so when the list is empty.
      this.customers.set([]);
    }
  }

  async create(): Promise<void> {
    const body: CreateUserRequest = {
      name: this.draft.name.trim(),
      email: this.draft.email.trim(),
      password: this.draft.password,
      role: this.draft.role,
      // Sent only for a portal login: the API refuses a company on an internal role.
      ...(this.isCustomer() ? { customerId: this.draft.customerId } : {}),
    };
    this.saving.set(true);
    try {
      const user = await firstValueFrom(this.api.post<UserRowDto>('/users', body));
      this.createOpen.set(false);
      this.toast.success('User created', `${user.name} can sign in as ${ROLE_LABEL[user.role]}.`);
      await this.load();
    } catch {
      /* the interceptor has already toasted the reason */
    } finally {
      this.saving.set(false);
    }
  }

  /** Open the editor on a copy, so cancelling leaves the row untouched. */
  edit(user: UserRowDto): void {
    this.editDraft = {
      name: user.name,
      email: user.email,
      role: user.role,
      customerId: user.customerId ?? '',
      active: user.active,
      resetPassword: false,
      password: '',
    };
    this.editing.set(user);
    if (user.role === Role.CUSTOMER && !this.customers().length) void this.loadCustomers();
  }

  canSaveEdit(): boolean {
    const named = this.editDraft.name.trim().length >= 2 && !!this.editDraft.email.trim();
    return named && (!this.editDraft.resetPassword || this.editDraft.password.length >= 6);
  }

  /**
   * Only what actually changed is sent. The API refuses a company on an internal
   * account and a role change on a portal login, so neither is ever offered here.
   */
  async saveEdit(): Promise<void> {
    const target = this.editing();
    if (!target || !this.canSaveEdit()) return;

    const body: UpdateUserRequest = {};
    const name = this.editDraft.name.trim();
    const email = this.editDraft.email.trim();
    if (name !== target.name) body.name = name;
    if (email !== target.email) body.email = email;
    if (target.role !== Role.CUSTOMER && this.editDraft.role !== target.role) {
      body.role = this.editDraft.role;
    }
    if (target.role === Role.CUSTOMER && this.editDraft.customerId !== (target.customerId ?? '')) {
      body.customerId = this.editDraft.customerId;
    }
    if (this.editDraft.active !== target.active) body.active = this.editDraft.active;
    if (this.editDraft.resetPassword) body.password = this.editDraft.password;

    if (!Object.keys(body).length) {
      this.editing.set(null);
      return;
    }

    this.saving.set(true);
    try {
      const saved = await firstValueFrom(this.api.patch<UserRowDto>(`/users/${target.id}`, body));
      this.editing.set(null);
      this.toast.success(
        'User updated',
        body.password
          ? `${saved.name} will be asked to choose their own password at their next sign-in.`
          : `${saved.name} is up to date.`,
      );
      await this.load();
    } catch {
      /* the interceptor has already toasted the reason */
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(user: UserRowDto): Promise<void> {
    this.busyId.set(user.id);
    try {
      await firstValueFrom(this.api.patch<UserRowDto>(`/users/${user.id}`, { active: !user.active }));
      this.toast.success(
        user.active ? 'Account deactivated' : 'Account reactivated',
        user.active ? `${user.name} is signed out of their next request.` : `${user.name} can sign in again.`,
      );
      await this.load();
    } catch {
      /* the interceptor has already toasted the reason */
    } finally {
      this.busyId.set(null);
    }
  }
}

/** The edit form's working copy, so Cancel really cancels. */
function emptyEditDraft() {
  return {
    name: '',
    email: '',
    role: INTERNAL_ROLES[1] as Role,
    customerId: '',
    active: true,
    resetPassword: false,
    password: '',
  };
}

/** The create form's working copy. */
function emptyDraft() {
  return {
    name: '',
    email: '',
    password: '',
    role: INTERNAL_ROLES[1] as Role,
    customerId: '',
  };
}
