const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH'
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

export type BusinessItem = {
  id: string
  businessId: string
  name: string
  unit: 'PZA' | 'KG' | 'G' | 'LT' | 'ML' | 'CAJA' | 'PAQUETE' | 'BOTELLA'
  category: string | null
  lastPrice: string | null
  defaultCounterpartyId: string | null
  defaultCounterparty: { id: string; name: string; phone: string | null } | null
  active: boolean
}

export type Counterparty = {
  id: string
  businessId: string
  name: string
  type: 'SUPPLIER' | 'LENDER'
  phone: string | null
  paymentTerms: string | null
  notes: string | null
  active: boolean
}

export type RequisitionStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ORDERED'
  | 'RECEIVED'
  | 'CANCELLED'

export type RequisitionLine = {
  id: string
  requisitionId: string
  itemId: string
  qty: string
  unitPrice: string
  receivedQty: string | null
  actualPrice: string | null
  item: BusinessItem
}

export type RequisitionItem = {
  id: string
  locationId: string
  counterpartyId: string | null
  folio: number
  status: RequisitionStatus
  requestedById: string | null
  approvedById: string | null
  estimatedTotal: string
  receivedTotal: string | null
  notes: string | null
  lines: RequisitionLine[]
  counterparty: Counterparty | null
  requestedBy: { id: string; name: string } | null
  approvedBy: { id: string; name: string } | null
}

export async function getBusinessItems({
  token,
  businessId,
}: {
  token: string
  businessId: string
}) {
  return request<{ items: BusinessItem[] }>(`/businesses/${businessId}/items`, {
    method: 'GET',
    token,
  })
}

export async function createBusinessItem({
  token,
  businessId,
  payload,
}: {
  token: string
  businessId: string
  payload: {
    name: string
    unit: BusinessItem['unit']
    category?: string
    lastPrice?: number
    defaultCounterpartyId?: string
  }
}) {
  return request<{ item: BusinessItem }>(`/businesses/${businessId}/items`, {
    method: 'POST',
    token,
    body: payload,
  })
}


export async function patchBusinessItem({
  token,
  businessId,
  itemId,
  payload,
}: {
  token: string
  businessId: string
  itemId: string
  payload: {
    name?: string
    unit?: BusinessItem['unit']
    category?: string | null
    lastPrice?: number | null
    defaultCounterpartyId?: string | null
  }
}) {
  return request<{ item: BusinessItem }>(`/businesses/${businessId}/items/${itemId}`, {
    method: 'PATCH',
    token,
    body: payload,
  })
}
export async function getBusinessCounterparties({
  token,
  businessId,
}: {
  token: string
  businessId: string
}) {
  return request<{ counterparties: Counterparty[] }>(`/businesses/${businessId}/counterparties`, {
    method: 'GET',
    token,
  })
}

export async function createBusinessCounterparty({
  token,
  businessId,
  payload,
}: {
  token: string
  businessId: string
  payload: {
    name: string
    phone?: string
    paymentTerms?: string
    notes?: string
  }
}) {
  return request<{ counterparty: Counterparty }>(`/businesses/${businessId}/counterparties`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function patchBusinessCounterparty({
  token,
  businessId,
  counterpartyId,
  payload,
}: {
  token: string
  businessId: string
  counterpartyId: string
  payload: {
    name?: string
    phone?: string | null
    paymentTerms?: string | null
    notes?: string | null
  }
}) {
  return request<{ counterparty: Counterparty }>(
    `/businesses/${businessId}/counterparties/${counterpartyId}`,
    {
      method: 'PATCH',
      token,
      body: payload,
    },
  )
}

export async function getLocationRequisitions({
  token,
  locationId,
  status,
}: {
  token: string
  locationId: string
  status?: RequisitionStatus
}) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  const query = params.toString() ? `?${params.toString()}` : ''
  return request<{ items: RequisitionItem[] }>(`/locations/${locationId}/requisitions${query}`, {
    method: 'GET',
    token,
  })
}

export async function createRequisition({
  token,
  locationId,
  payload,
}: {
  token: string
  locationId: string
  payload: {
    counterpartyId?: string
    notes?: string
    lines: Array<{ itemId: string; qty: number; unitPrice?: number }>
  }
}) {
  return request<{ requisition: RequisitionItem }>(`/locations/${locationId}/requisitions`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function approveRequisition({ token, requisitionId }: { token: string; requisitionId: string }) {
  return request<{ requisition: RequisitionItem }>(`/requisitions/${requisitionId}/approve`, {
    method: 'POST',
    token,
  })
}

export async function cancelRequisition({ token, requisitionId }: { token: string; requisitionId: string }) {
  return request<{ requisition: RequisitionItem }>(`/requisitions/${requisitionId}/cancel`, {
    method: 'POST',
    token,
  })
}

export async function receiveRequisition({
  token,
  requisitionId,
  payload,
}: {
  token: string
  requisitionId: string
  payload: {
    counterpartyId?: string
    lines: Array<{ lineId: string; receivedQty: number; actualPrice: number }>
  }
}) {
  return request<{ requisition: RequisitionItem }>(`/requisitions/${requisitionId}/receive`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function login(input: { email: string; password: string }) {
  return request<{
    token: string
    user: { id: string; name: string; email: string; isSuperAdmin: boolean }
    memberships: any[]
  }>('/auth/login', {
    method: 'POST',
    body: input,
  })
}

export async function me(token: string) {
  return request<{
    user: { id: string; name: string; email: string; isSuperAdmin: boolean }
    memberships: any[]
  }>('/me', {
    method: 'GET',
    token,
  })
}

export type WaitlistLead = {
  id: string
  name: string
  email: string
  whatsapp: string | null
  businessName: string | null
  businessType: string | null
  source: string | null
  createdAt: string
}

export async function getWaitlist({ token }: { token: string }) {
  return request<{ items: WaitlistLead[] }>('/waitlist', {
    method: 'GET',
    token,
  })
}

export type DashboardSummary = {
  hoy: {
    ventasNetas: number
    faltantes: number
  }
  mes: {
    ventasNetas: number
    faltantes: number
    cierres: number
  }
}

export async function getDashboardSummary({
  token,
  locationId,
}: {
  token: string
  locationId: string
}) {
  return request<DashboardSummary>(`/locations/${locationId}/dashboard-summary`, {
    method: 'GET',
    token,
  })
}

export type BusinessMember = {
  id: string
  name: string
  email: string
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF'
  locationId: string | null
  locationName: string | null
}

export async function getBusinessMembers({
  token,
  businessId,
}: {
  token: string
  businessId: string
}) {
  return request<{ items: BusinessMember[] }>(`/businesses/${businessId}/members`, {
    method: 'GET',
    token,
  })
}

export async function createBusinessMember({
  token,
  businessId,
  payload,
}: {
  token: string
  businessId: string
  payload: {
    name: string
    email: string
    password: string
    role: 'ADMIN' | 'MANAGER' | 'STAFF'
    locationId?: string | null
  }
}) {
  return request<{ member: BusinessMember }>(`/businesses/${businessId}/members`, {
    method: 'POST',
    token,
    body: payload,
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
