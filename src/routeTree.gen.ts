/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as SingRouteImport } from './routes/sing'
import { Route as StudioRouteImport } from './routes/studio'
import { Route as WriteRouteImport } from './routes/write'

const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)

const SingRoute = SingRouteImport.update({
  id: '/sing',
  path: '/sing',
  getParentRoute: () => rootRouteImport,
} as any)

const StudioRoute = StudioRouteImport.update({
  id: '/studio',
  path: '/studio',
  getParentRoute: () => rootRouteImport,
} as any)

const WriteRoute = WriteRouteImport.update({
  id: '/write',
  path: '/write',
  getParentRoute: () => rootRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/sing': typeof SingRoute
  '/studio': typeof StudioRoute
  '/write': typeof WriteRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/sing': typeof SingRoute
  '/studio': typeof StudioRoute
  '/write': typeof WriteRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/sing': typeof SingRoute
  '/studio': typeof StudioRoute
  '/write': typeof WriteRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/sing' | '/studio' | '/write'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/sing' | '/studio' | '/write'
  id: '__root__' | '/' | '/sing' | '/studio' | '/write'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  SingRoute: typeof SingRoute
  StudioRoute: typeof StudioRoute
  WriteRoute: typeof WriteRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/sing': {
      id: '/sing'
      path: '/sing'
      fullPath: '/sing'
      preLoaderRoute: typeof SingRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/studio': {
      id: '/studio'
      path: '/studio'
      fullPath: '/studio'
      preLoaderRoute: typeof StudioRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/write': {
      id: '/write'
      path: '/write'
      fullPath: '/write'
      preLoaderRoute: typeof WriteRouteImport
      parentRoute: typeof rootRouteImport
    }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  SingRoute: SingRoute,
  StudioRoute: StudioRoute,
  WriteRoute: WriteRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}
