import type { AppRoute } from '../types';

const ROUTE_PATHS: Record<string, AppRoute> = {
  '/results': 'results',
  '/terms': 'terms',
  '/privacy': 'privacy'
};

export function routeFromPath(pathname: string): AppRoute {
  for (const [prefix, route] of Object.entries(ROUTE_PATHS)) {
    if (pathname.startsWith(prefix)) {
      return route;
    }
  }

  return 'scan';
}

export function pathForRoute(route: AppRoute): string {
  if (route === 'results') return '/results';
  if (route === 'terms') return '/terms';
  if (route === 'privacy') return '/privacy';
  return '/';
}
