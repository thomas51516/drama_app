import type { AdminRole } from '../types/api'

/**
 * Back-office modules (cahier des charges §5, B-01 to B-13, plus B-03bis the help center).
 * `path` is the route in the admin app; `labelKey` points to i18n `nav.*`.
 */
export interface BackofficeModule {
  key: string
  ticket: `B-${string}`
  labelKey: string
  path: string
  icon: string
  /** Roles that may open the module; every role when omitted. */
  roles?: readonly AdminRole[]
  /** Sidebar badge fed by a store (`supportInbox` = open tickets). */
  badge?: 'supportInbox'
  /** Secondary pages listed under the module in the sidebar (own role gating). */
  children?: readonly BackofficeSubpage[]
}

export interface BackofficeSubpage {
  key: string
  labelKey: string
  path: string
  roles?: readonly AdminRole[]
}

export const backofficeModules: readonly BackofficeModule[] = [
  {
    key: 'catalogue',
    ticket: 'B-01',
    labelKey: 'nav.catalogue',
    path: '/series',
    icon: 'pi pi-book',
  },
  {
    key: 'episodes',
    ticket: 'B-02',
    labelKey: 'nav.episodes',
    path: '/episodes',
    icon: 'pi pi-video',
  },
  {
    key: 'subtitles',
    ticket: 'B-03',
    labelKey: 'nav.subtitles',
    path: '/subtitles',
    icon: 'pi pi-language',
  },
  {
    key: 'helpCenter',
    ticket: 'B-03bis',
    labelKey: 'nav.helpCenter',
    path: '/help-center',
    icon: 'pi pi-question-circle',
    roles: ['EDITOR', 'SUPPORT', 'ADMIN'],
    badge: 'supportInbox',
  },
  {
    key: 'scheduling',
    ticket: 'B-04',
    labelKey: 'nav.scheduling',
    path: '/schedule',
    icon: 'pi pi-calendar',
  },
  {
    key: 'featuring',
    ticket: 'B-05',
    labelKey: 'nav.featuring',
    path: '/featured',
    icon: 'pi pi-star',
  },
  {
    key: 'monetization',
    ticket: 'B-06',
    labelKey: 'nav.monetization',
    path: '/monetization',
    icon: 'pi pi-wallet',
    roles: ['MONETIZATION', 'ADMIN'],
  },
  {
    key: 'offers',
    ticket: 'B-07',
    labelKey: 'nav.offers',
    path: '/offers',
    icon: 'pi pi-tag',
    roles: ['MONETIZATION', 'ADMIN'],
  },
  {
    key: 'rewards',
    ticket: 'B-08',
    labelKey: 'nav.rewards',
    path: '/rewards',
    icon: 'pi pi-gift',
    roles: ['MONETIZATION', 'ADMIN'],
  },
  {
    key: 'users',
    ticket: 'B-09',
    labelKey: 'nav.users',
    path: '/users',
    icon: 'pi pi-users',
    roles: ['SUPPORT', 'ADMIN'],
  },
  {
    key: 'notifications',
    ticket: 'B-10',
    labelKey: 'nav.notifications',
    path: '/campaigns',
    icon: 'pi pi-bell',
    roles: ['MONETIZATION', 'ADMIN'],
  },
  {
    key: 'dashboards',
    ticket: 'B-11',
    labelKey: 'nav.dashboards',
    path: '/dashboard',
    icon: 'pi pi-chart-bar',
    children: [
      {
        key: 'topupReconciliation',
        labelKey: 'nav.topupReconciliation',
        path: '/topup-reconciliation',
        roles: ['MONETIZATION', 'ADMIN'],
      },
    ],
  },
  {
    key: 'rights',
    ticket: 'B-12',
    labelKey: 'nav.rights',
    path: '/rights',
    icon: 'pi pi-file-check',
  },
  {
    key: 'administration',
    ticket: 'B-13',
    labelKey: 'nav.administration',
    path: '/administration',
    icon: 'pi pi-cog',
  },
]

export function findModuleByPath(path: string): BackofficeModule | undefined {
  return backofficeModules.find((module) => module.path === path)
}

/** The sub-page registered at `path` (e.g. `/topup-reconciliation`) with its parent module. */
export function findSubpageByPath(
  path: string,
): { module: BackofficeModule; subpage: BackofficeSubpage } | undefined {
  for (const module of backofficeModules) {
    const subpage = module.children?.find((child) => child.path === path)
    if (subpage) return { module, subpage }
  }
  return undefined
}

/** True when `role` may open the module (no `roles` = everyone). */
export function moduleAllowsRole(
  module: Pick<BackofficeModule, 'roles'>,
  role: AdminRole | null | undefined,
): boolean {
  return !module.roles || (Boolean(role) && module.roles.includes(role as AdminRole))
}
