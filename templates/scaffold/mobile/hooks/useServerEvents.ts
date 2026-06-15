import { useEffect } from 'react'
import EventSource from 'react-native-sse'

export function useServerEvents(
  url: string,
  token: string,
  handlers: Record<string, (data: unknown) => void>,
) {
  useEffect(() => {
    const es = new EventSource(url, { headers: { Authorization: `Bearer ${token}` } })
    Object.entries(handlers).forEach(([event, handler]) => {
      es.addEventListener(event, (e) => handler(JSON.parse((e as MessageEvent).data)))
    })
    return () => es.close()
  }, [url, token])
}
