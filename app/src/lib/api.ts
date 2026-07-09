const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000'

type RequestOptions = {
  method?: 'GET' | 'POST'
  body?: unknown
  token?: string
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })

  const json = await response.json()
  if (!response.ok) {
    const message = json?.error || json?.message || 'Error de red'
    throw new Error(message)
  }
  return json
}

export async function register(input: {
  name: string
  email: string
  password: string
  businessName: string
}) {
  return request<{
    token: string
    user: { id: string; name: string; email: string }
    business: { id: string; name: string; slug: string }
  }>('/auth/register', {
    method: 'POST',
    body: input,
  })
}

export async function login(input: { email: string; password: string }) {
  return request<{
    token: string
    user: { id: string; name: string; email: string }
    memberships: any[]
  }>('/auth/login', {
    method: 'POST',
    body: input,
  })
}

export async function me(token: string) {
  return request<{
    user: { id: string; name: string; email: string }
    memberships: any[]
  }>('/me', {
    method: 'GET',
    token,
  })
}

export type ShiftClosingLine = {
  id: string
  channel: 'PISO' | 'RAPPI' | 'UBER_EATS' | 'DIDI_FOOD' | 'EVENTO' | 'OTRO'
  method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'APP' | 'OTRO'
  gross: string
  feePct: string
  feeAmount: string
  net: string
}

export type ShiftClosingItem = {
  id: string
  openingCash: string
  expectedCash: string
  countedCash: string
  difference: string
  cashWithdrawn: string
  shift: {
    id: string
    date: string
    type: 'MATUTINO' | 'VESPERTINO' | 'NOCTURNO' | 'UNICO'
  }
  closedBy: { id: string; name: string } | null
  lines: ShiftClosingLine[]
}

export async function getShiftClosings({
  token,
  locationId,
  from,
  to,
}: {
  token: string
  locationId: string
  from?: string
  to?: string
}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  const query = params.toString() ? `?${params.toString()}` : ''

  return request<{ items: ShiftClosingItem[] }>(`/locations/${locationId}/shift-closings${query}`, {
    method: 'GET',
    token,
  })
}

export async function createShiftClosing({
  token,
  locationId,
  payload,
}: {
  token: string
  locationId: string
  payload: {
    date: string
    type: 'MATUTINO' | 'VESPERTINO' | 'NOCTURNO' | 'UNICO'
    openingCash: number
    cashWithdrawn: number
    countedCash: number
    ticketCount?: number
    notes?: string
    lines: Array<{
      channel: 'PISO' | 'RAPPI' | 'UBER_EATS' | 'DIDI_FOOD' | 'EVENTO' | 'OTRO'
      method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'APP' | 'OTRO'
      gross: number
      feePct?: number
    }>
  }
}) {
  return request<{
    closing: ShiftClosingItem
    cashStatus: 'CUADRO' | 'FALTANTE'
  }>(`/locations/${locationId}/shift-closings`, {
    method: 'POST',
    token,
    body: payload,
  })
}
