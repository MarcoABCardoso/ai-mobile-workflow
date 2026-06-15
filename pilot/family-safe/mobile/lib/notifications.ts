import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { apiClient } from '../../shared/api-client/src/index'

export async function registerForPushNotifications(): Promise<void> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') return

  const token = (await Notifications.getExpoPushTokenAsync()).data

  await apiClient.POST('/devices/register', {
    body: {
      token,
      platform: Platform.OS === 'ios' ? 'apns' : 'gcm',
    },
  })
}
