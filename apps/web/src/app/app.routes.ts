/**
 * APPEND-ONLY ROUTE TABLE.
 *
 * Each feature is lazy-loaded. To add a screen, append ONE entry to the right
 * children array — never restructure this file. Routes are grouped by
 * feature area below, matching the module boundaries in `docs/`.
 */
import { Role } from '@dealflow/shared';
import type { Routes } from '@angular/router';
import { authGuard, internalGuard, portalGuard, roleGuard } from './core/guards/auth.guard';

export const APP_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },

  /* --------------------------------------------------- screen 1: sign in */
  {
    path: 'login',
    title: 'Sign in · DealFlow360',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'signup',
    title: 'Create an account · DealFlow360',
    loadComponent: () => import('./features/auth/signup.page').then((m) => m.SignupPage),
  },

  /* ------------------------------------------------- the internal workspace */
  {
    path: 'app',
    canActivate: [internalGuard],
    loadComponent: () => import('./layouts/internal-shell.component').then((m) => m.InternalShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      // --- quotations ---
      { path: 'dashboard', title: 'Dashboard · DealFlow360', loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'quotations', title: 'Quotations · DealFlow360', loadComponent: () => import('./features/quotations/quotation-list.page').then((m) => m.QuotationListPage) },
      { path: 'quotations/:id', title: 'Quotation · DealFlow360', loadComponent: () => import('./features/quotations/quotation-detail.page').then((m) => m.QuotationDetailPage) },
      // --- approvals ---
      { path: 'approvals', title: 'Approvals · DealFlow360', canActivate: [roleGuard([Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE])], loadComponent: () => import('./features/approvals/approval-list.page').then((m) => m.ApprovalListPage) },
      { path: 'approvals/:id', title: 'Approval · DealFlow360', canActivate: [roleGuard([Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE])], loadComponent: () => import('./features/approvals/approval-detail.page').then((m) => m.ApprovalDetailPage) },
      // --- fulfillment, billing, deal health, reporting ---
      { path: 'fulfillment', title: 'Fulfillment · DealFlow360', loadComponent: () => import('./features/fulfillment/fulfillment-list.page').then((m) => m.FulfillmentListPage) },
      { path: 'fulfillment/:id', title: 'Fulfillment · DealFlow360', loadComponent: () => import('./features/fulfillment/fulfillment-detail.page').then((m) => m.FulfillmentDetailPage) },
      { path: 'subscriptions', title: 'Subscriptions · DealFlow360', loadComponent: () => import('./features/subscriptions/subscription-list.page').then((m) => m.SubscriptionListPage) },
      { path: 'subscriptions/:id', title: 'Billing · DealFlow360', loadComponent: () => import('./features/billing/billing-detail.page').then((m) => m.BillingDetailPage) },
      { path: 'invoices', title: 'Invoices · DealFlow360', loadComponent: () => import('./features/invoices/invoice-list.page').then((m) => m.InvoiceListPage) },
      { path: 'invoices/:id', title: 'Invoice · DealFlow360', loadComponent: () => import('./features/invoices/invoice-detail.page').then((m) => m.InvoiceDetailPage) },
      { path: 'deal-health', title: 'Deal Health · DealFlow360', loadComponent: () => import('./features/dealHealth/deal-health.page').then((m) => m.DealHealthPage) },
      { path: 'reports', title: 'Reports · DealFlow360', canActivate: [roleGuard([Role.ADMIN, Role.SALES_MANAGER, Role.FINANCE])], loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage) },
    ],
  },

  /* ------------------------------------------------------ the admin area */
  {
    path: 'admin',
    canActivate: [roleGuard([Role.ADMIN, Role.SALES_MANAGER])],
    loadComponent: () => import('./layouts/admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'products' },
      { path: 'products', title: 'Products · DealFlow360', loadComponent: () => import('./features/admin/product-list.page').then((m) => m.ProductListPage) },
      { path: 'products/:id', title: 'Product · DealFlow360', loadComponent: () => import('./features/admin/product-detail.page').then((m) => m.ProductDetailPage) },
      { path: 'pricelists', title: 'Price Lists · DealFlow360', loadComponent: () => import('./features/admin/pricelists.page').then((m) => m.PriceListsPage) },
      { path: 'warehouses', title: 'Warehouses · DealFlow360', loadComponent: () => import('./features/admin/warehouses.page').then((m) => m.WarehousesPage) },
      { path: 'plans', title: 'Subscription Plans · DealFlow360', loadComponent: () => import('./features/admin/plans.page').then((m) => m.PlansPage) },
      { path: 'config', title: 'Discount Tiers & Approvals · DealFlow360', loadComponent: () => import('./features/admin/config.page').then((m) => m.ConfigPage) },
    ],
  },

  /* -------------------------------------------------- the customer portal */
  {
    path: 'portal',
    canActivate: [portalGuard],
    loadComponent: () => import('./layouts/portal-shell.component').then((m) => m.PortalShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'quotations' },
      { path: 'quotations', title: 'Your quotations', loadComponent: () => import('./portal/portal-quotations.page').then((m) => m.PortalQuotationsPage) },
      { path: 'quotation', title: 'Your quotation', loadComponent: () => import('./portal/portal-quotation.page').then((m) => m.PortalQuotationPage) },
      { path: 'q/:number', title: 'Your quotation', loadComponent: () => import('./portal/portal-quotation.page').then((m) => m.PortalQuotationPage) },
      { path: 'messages', title: 'Messages', loadComponent: () => import('./portal/portal-messages.page').then((m) => m.PortalMessagesPage) },
      { path: 'profile', title: 'Profile', loadComponent: () => import('./portal/portal-profile.page').then((m) => m.PortalProfilePage) },
    ],
  },

  { path: '**', loadComponent: () => import('./features/auth/not-found.page').then((m) => m.NotFoundPage) },
];

/** Referenced by the guards; kept here so the auth barrel has no cycle. */
export const AUTH_GUARDS = { authGuard, internalGuard, portalGuard, roleGuard };
