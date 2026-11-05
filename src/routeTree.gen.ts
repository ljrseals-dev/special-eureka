/* eslint-disable */
// @ts-nocheck
import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as SingRouteImport } from './routes/sing'
import { Route as StudioRouteImport } from './routes/studio'
import { Route as WriteRouteImport } from './routes/write'
import { Route as PipelineRouteImport } from './routes/pipeline'

const IndexRoute = IndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => rootRouteImport } as any)
const SingRoute = SingRouteImport.update({ id: '/sing', path: '/sing', getParentRoute: () => rootRouteImport } as any)
const StudioRoute = StudioRouteImport.update({ id: '/studio', path: '/studio', getParentRoute: () => rootRouteImport } as any)
const WriteRoute = WriteRouteImport.update({ id: '/write', path: '/write', getParentRoute: () => rootRouteImport } as any)
const PipelineRoute = PipelineRouteImport.update({ id: '/pipeline', path: '/pipeline', getParentRoute: () => rootRouteImport } as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/sing': typeof SingRoute
  '/studio': typeof StudioRoute
  '/write': typeof WriteRoute
  '/pipeline': typeof PipelineRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/sing': typeof SingRoute
  '/studio': typeof StudioRoute
  '/write': typeof WriteRoute
  '/pipeline': typeof PipelineRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/sing': typeof SingRoute
  '/studio': typeof StudioRoute
  '/write': typeof WriteRoute
  '/pipeline': typeof PipelineRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/sing' | '/studio' | '/write' | '/pipeline'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/sing' | '/studio' | '/write' | '/pipeline'
  id: '__root__' | '/' | '/sing' | '/studio' | '/write' | '/pipeline'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  SingRoute: typeof SingRoute
  StudioRoute: typeof StudioRoute
  WriteRoute: typeof WriteRoute
  PipelineRoute: typeof PipelineRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': { id: '/'; path: '/'; fullPath: '/'; preLoaderRoute: typeof IndexRouteImport; parentRoute: typeof rootRouteImport }
    '/sing': { id: '/sing'; path: '/sing'; fullPath: '/sing'; preLoaderRoute: typeof SingRouteImport; parentRoute: typeof rootRouteImport }
    '/studio': { id: '/studio'; path: '/studio'; fullPath: '/studio'; preLoaderRoute: typeof StudioRouteImport; parentRoute: typeof rootRouteImport }
    '/write': { id: '/write'; path: '/write'; fullPath: '/write'; preLoaderRoute: typeof WriteRouteImport; parentRoute: typeof rootRouteImport }
    '/pipeline': { id: '/pipeline'; path: '/pipeline'; fullPath: '/pipeline'; preLoaderRoute: typeof PipelineRouteImport; parentRoute: typeof rootRouteImport }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute, SingRoute, StudioRoute, WriteRoute, PipelineRoute,
}
export const routeTree = rootRouteImport._addFileChildren(rootRouteChildren)._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}
