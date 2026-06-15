export interface User {
  id: string
  externalId: string
  email?: string
  createdAt: string
}

export interface DeviceToken {
  id: string
  userId: string
  token: string
  platform: 'apns' | 'gcm'
  createdAt: string
}
