# ADR 012 — Real-time server push via SSE (`realtime` addon)

**Status:** Accepted  
**Date:** 2026-06-15

## Context

Some apps need the server to push data to connected clients without the client polling. The two main options are Server-Sent Events (SSE) and WebSockets. This decision picks one as the workflow default.

## Decision

**Server-Sent Events (SSE)** as the default real-time mechanism.

SSE is a standard HTTP feature: the server holds a connection open and streams `text/event-stream` data. The client uses the browser's native `EventSource` API (or a polyfill on React Native).

WebSockets are supported by Fastify via `@fastify/websocket` but are not the workflow default. Use WebSockets only when you need bidirectional streaming (e.g. a full messaging app). For the vast majority of real-time needs — live updates, location events, notifications delivered while the app is in the foreground — SSE is sufficient and much simpler.

## What gets scaffolded

**Service SSE helper (`src/plugins/sse.ts`):**
```typescript
import fp from 'fastify-plugin'
import type { FastifyReply } from 'fastify'

export default fp(async (app) => {
  // In-memory subscriber registry — see scaling note below
  const subscribers = new Map<string, Set<FastifyReply>>()

  app.decorate('subscribeClient', (userId: string, reply: FastifyReply) => {
    if (!subscribers.has(userId)) subscribers.set(userId, new Set())
    subscribers.get(userId)!.add(reply)
    reply.raw.on('close', () => {
      subscribers.get(userId)?.delete(reply)
    })
  })

  app.decorate('pushToUser', (userId: string, event: string, data: unknown) => {
    const clients = subscribers.get(userId) ?? new Set()
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    for (const reply of clients) {
      reply.raw.write(payload)
    }
  })
})
```

**Example SSE route:**
```typescript
app.get('/events', {
  schema: { security: [{ bearerAuth: [] }] },
}, async (req, reply) => {
  reply.raw.setHeader('Content-Type', 'text/event-stream')
  reply.raw.setHeader('Cache-Control', 'no-cache')
  reply.raw.setHeader('Connection', 'keep-alive')
  reply.raw.flushHeaders()

  app.subscribeClient(req.user.id, reply)

  // Keep the connection alive until the client disconnects
  await new Promise<void>((resolve) => req.raw.on('close', resolve))
})
```

**Mobile hook (`mobile/hooks/useServerEvents.ts`):**
```typescript
import { useEffect } from 'react'
import { useAuthToken } from './useAuthToken'

export function useServerEvents(
  onEvent: (type: string, data: unknown) => void
) {
  const token = useAuthToken()

  useEffect(() => {
    if (!token) return
    const url = `${process.env.EXPO_PUBLIC_API_URL}/events`
    // React Native doesn't have native EventSource — use a polyfill
    // Install: npm add react-native-sse
    const es = new EventSource(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    es.onmessage = (e) => {
      try { onEvent(e.type, JSON.parse(e.data)) } catch {}
    }
    return () => es.close()
  }, [token])
}
```

> Install `react-native-sse` in the mobile workspace — it polyfills `EventSource` for React Native.

## Infrastructure notes

**Cloud Run (GCP):** extend the request timeout to `3600s` (the Terraform variable `enable_realtime = true` sets this). Default is 300s, which would terminate long-lived SSE connections.

**Container Apps (Azure):** the default request timeout is sufficient for SSE. No IaC changes required.

## Scaling caveat

The in-memory subscriber registry only works on a **single-instance** deployment. When the service scales to multiple instances, an event pushed to instance A won't reach a client connected to instance B.

**For production at scale**, replace the in-memory registry with Redis Pub/Sub:
- Each instance subscribes to a Redis channel on connection.
- `pushToUser` publishes to the Redis channel instead of the local map.
- Every instance receives the message and forwards it to any matching local connections.

This is out of scope for the initial addon scaffold. The in-memory approach is correct for development and for single-instance production deployments (min instances = 1 with session affinity).

## When to use WebSockets instead

Use WebSockets when the client needs to send high-frequency data to the server over the same persistent connection — e.g. collaborative editing, real-time cursors, or a full messaging app. Add `@fastify/websocket` to the service when this is needed. SSE remains appropriate for everything else.

## Trade-offs

- SSE is unidirectional (server → client only). Clients still use normal REST calls to send data to the server. This is the right separation for most apps.
- The `EventSource` browser API has a connection limit per origin (~6). React Native is not subject to this limit.
- The `react-native-sse` polyfill is a small, maintained library. If this becomes a concern, the hook can be replaced with a WebSocket-based alternative without changing the server-side SSE route.
