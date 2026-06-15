import * as Notifications from 'expo-notifications'
import { apiClient } from '@{{project_name}}/api-client'

export async function registerPushToken() {
  const { status } = await Notifications.requestPermissionsAsync()
  if (status !== 'granted') return

  const { data: token } = await Notifications.getExpoPushTokenAsync()
  await apiClient.POST('/devices/register', {
    body: { token, platform: 'ios' },
  })
}
