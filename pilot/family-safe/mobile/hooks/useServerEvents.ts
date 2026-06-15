import { useEffect, useRef } from 'react'
import EventSource from 'react-native-sse'

export function useServerEvents(
  url: string,
  token: string,
  onEvent: (type: string, data: unknown) => void,
) {
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    es.addEventListener('message', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data)
        onEvent('message', data)
      } catch {
        // ignore malformed events
      }
    })

    esRef.current = es
    return () => { es.close() }
  }, [url, token, onEvent])
}
