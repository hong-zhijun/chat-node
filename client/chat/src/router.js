import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/login',       component: () => import('./pages/LoginPage.vue') },
  { path: '/admin/login', component: () => import('./pages/AdminLoginPage.vue') },
  {
    path: '/admin',
    component: () => import('./pages/admin/AdminLayout.vue'),
    children: [
      { path: '',        component: () => import('./pages/admin/OverviewPage.vue') },
      { path: 'users',   component: () => import('./pages/admin/UsersPage.vue') },
      { path: 'cleanup', component: () => import('./pages/admin/CleanupPage.vue') },
      { path: 'config',   component: () => import('./pages/admin/ConfigPage.vue') },
      { path: 'fillers',  component: () => import('./pages/admin/FillersPage.vue') },
    ]
  },
  { path: '/',              component: () => import('./pages/ChatPage.vue') },
  { path: '/:pathMatch(.*)*', redirect: '/' }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const token      = localStorage.getItem('nodex-token')
  const adminToken = localStorage.getItem('nodex-admin-token')
  const isPublic   = to.path === '/login' || to.path === '/admin/login'
  const isAdmin    = to.path.startsWith('/admin')

  if (!isPublic) {
    if (isAdmin && !adminToken) return '/admin/login'
    if (!isAdmin && !token)     return '/login'
  }
})

export default router
