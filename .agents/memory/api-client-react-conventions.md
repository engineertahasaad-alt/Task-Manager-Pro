---
name: api-client-react conventions
description: How the generated @workspace/api-client-react hooks/query-keys must be called; two recurring bug classes.
---

The Orval-generated client at `lib/api-client-react/src/generated/api.ts` has two non-obvious conventions that have each caused production bugs in the Taskaya apps.

## 1. React Query keys are URL-based, NOT operationId-based
The generated query key for an endpoint is the request path, e.g. `getListNotificationsQueryKey()` → `['/api/notifications']`, `getGetTaskQueryKey(id)` → `['/api/tasks/${id}']`, `getListTasksQueryKey(params)` → `['/api/tasks', params]`.

**Bug class:** manual `queryClient.invalidateQueries({ queryKey: ['listNotifications'] })` (operationId-style) silently never matches → the list never refetches → mutations like mark-read / mark-all-read appear to "do nothing" even though the server succeeded.

**How to apply:** always import and call the generated key getter (`getListNotificationsQueryKey()`, etc.) for invalidations. The package re-exports them via `export *`. Never hand-write the key string. Team/users screens already follow this with `getListUsersQueryKey()`.

## 2. Query hooks take a POSITIONAL id; mutation hooks take an object
- Query hooks: `useGetTask(id: number, options?)`, `useListMessages(id: number, options?)` — first arg is the bare id.
- Mutation hooks: `useCompleteTask()` etc. are called as `mutate({ id })` / `mutate({ id, data })`.

**Bug class:** calling a query hook with an object, e.g. `useGetTask({ id: taskId })`, stringifies to the URL `/api/tasks/[object Object]` → 404 → screen renders its not-found / empty state. This made the mobile task-detail screen permanently broken while the web app (which used positional `useGetTask(taskId, {...})`) worked.

**How to apply:** pass the id positionally to query hooks; reserve `{ id, data }` objects for mutation hooks.
