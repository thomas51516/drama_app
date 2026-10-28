/**
 * Back-office modules (cahier des charges §5, B-01 to B-13).
 * `path` is the route in the admin app; `labelKey` points to i18n `nav.*`.
 */
export interface BackofficeModule {
  key: string
  ticket: `B-${string}`
  labelKey: string
  path: string
  icon: string
}

export const backofficeModules: readonly BackofficeModule[] = [
  { key: 'catalogue', ticket: 'B-01', labelKey: 'nav.catalogue', path: '/series', icon: 'pi pi-book' },
  { key: 'episodes', ticket: 'B-02', labelKey: 'nav.episodes', path: '/episodes', icon: 'pi pi-video' },
  { key: 'subtitles', ticket: 'B-03', labelKey: 'nav.subtitles', path: '/subtitles', icon: 'pi pi-language' },
  { key: 'scheduling', ticket: 'B-04', labelKey: 'nav.scheduling', path: '/scheduling', icon: 'pi pi-calendar' },
  { key: 'featuring', ticket: 'B-05', labelKey: 'nav.featuring', path: '/featuring', icon: 'pi pi-star' },
  { key: 'monetization', ticket: 'B-06', labelKey: 'nav.monetization', path: '/monetization', icon: 'pi pi-wallet' },
  { key: 'offers', ticket: 'B-07', labelKey: 'nav.offers', path: '/offers', icon: 'pi pi-tag' },
  { key: 'rewards', ticket: 'B-08', labelKey: 'nav.rewards', path: '/rewards', icon: 'pi pi-gift' },
  { key: 'users', ticket: 'B-09', labelKey: 'nav.users', path: '/users', icon: 'pi pi-users' },
  { key: 'notifications', ticket: 'B-10', labelKey: 'nav.notifications', path: '/notifications', icon: 'pi pi-bell' },
  { key: 'dashboards', ticket: 'B-11', labelKey: 'nav.dashboards', path: '/dashboards', icon: 'pi pi-chart-bar' },
  { key: 'rights', ticket: 'B-12', labelKey: 'nav.rights', path: '/rights', icon: 'pi pi-file-check' },
  { key: 'administration', ticket: 'B-13', labelKey: 'nav.administration', path: '/administration', icon: 'pi pi-cog' },
]

export function findModuleByPath(path: string): BackofficeModule | undefined {
  return backofficeModules.find((module) => module.path === path)
}
