import { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('layouts/MainLayout.vue'),
    children: [
      {
        path: '/',
        name: 'Home',
        component: () => import('src/pages/HomePage.vue'),
      },
      {
        path: '/channels',
        name: 'Channels',
        component: () => import('src/pages/ChannelsPage.vue'),
      },
      {
        path: '/radio',
        name: 'Radio',
        component: () => import('src/pages/RadioPage.vue'),
      },
    ],
  },

  // Always leave this as last one,
  // but you can also remove it
  {
    path: '/:catchAll(.*)*',
    component: () => import('pages/ErrorNotFound.vue'),
  },
];

export default routes;
