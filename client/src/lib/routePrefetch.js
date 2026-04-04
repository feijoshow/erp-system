const routeLoaders = {
  '/login': () => import('../pages/Login'),
  '/dashboard': () => import('../pages/Dashboard'),
  '/operations': () => import('../pages/OperationsCenter'),
  '/approvals': () => import('../pages/Approvals'),
  '/products': () => import('../pages/Products'),
  '/customers': () => import('../pages/Customers'),
  '/customers/profile': () => import('../pages/CustomerProfile'),
  '/orders': () => import('../pages/Orders'),
  '/invoices': () => import('../pages/Invoices'),
  '/admin/pending-refunds': () => import('../pages/PendingRefunds'),
};

const cache = new Map();

export function loadRoute(path) {
  const loader = routeLoaders[path];
  if (!loader) {
    return Promise.resolve(null);
  }

  if (!cache.has(path)) {
    cache.set(path, loader());
  }

  return cache.get(path);
}

export function prefetchRoute(path) {
  loadRoute(path).catch(() => null);
}
