const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
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
  all = false,
}: {
  token: string
  businessId: string
  all?: boolean
}) {
  const query = all ? '?all=true' : ''
  return request<{ items: BusinessItem[] }>(`/businesses/${businessId}/items${query}`, {
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

export async function deleteBusinessItem({
  token,
  businessId,
  itemId,
}: {
  token: string
  businessId: string
  itemId: string
}) {
  return request<{ deleted: boolean; deactivated: boolean; message: string }>(
    `/businesses/${businessId}/items/${itemId}`,
    {
      method: 'DELETE',
      token,
    },
  )
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
    active?: boolean
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
  all = false,
}: {
  token: string
  businessId: string
  all?: boolean
}) {
  const query = all ? '?all=true' : ''
  return request<{ counterparties: Counterparty[] }>(`/businesses/${businessId}/counterparties${query}`, {
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
    active?: boolean
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

export async function deleteBusinessCounterparty({
  token,
  businessId,
  counterpartyId,
}: {
  token: string
  businessId: string
  counterpartyId: string
}) {
  return request<{ deleted: boolean; deactivated: boolean; message: string }>(
    `/businesses/${businessId}/counterparties/${counterpartyId}`,
    {
      method: 'DELETE',
      token,
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

export type ExpenseCategory = {
  id: string
  businessId: string
  name: string
  kind: 'COSTO_VENTA' | 'OPERATIVO' | 'REMODELACION' | 'FINANCIERO'
}

export type ExpenseItem = {
  id: string
  locationId: string
  categoryId: string
  counterpartyId: string | null
  date: string
  concept: string
  amount: string
  method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'APP' | 'OTRO'
  paidFromCash: boolean
  evidenceUrl: string | null
  source: 'MANUAL' | 'REQUISITION' | 'PAYROLL' | 'LOAN_PAYMENT'
  purchaseId: string | null
  payrollEntryId: string | null
  createdById: string | null
  createdAt: string
  category: ExpenseCategory
  counterparty: Counterparty | null
}

export type PnlSummary = {
  month: string
  ingresos: number
  costoVenta: number
  operativos: number
  financieros: number
  utilidadBruta: number
  utilidadOperativa: number
  margen: number
  desgloseCategorias: Array<{
    categoria: string
    kind: 'COSTO_VENTA' | 'OPERATIVO' | 'REMODELACION' | 'FINANCIERO'
    total: number
  }>
}

export async function getExpenseCategories({
  token,
  businessId,
}: {
  token: string
  businessId: string
}) {
  return request<{ items: ExpenseCategory[] }>(`/businesses/${businessId}/expense-categories`, {
    method: 'GET',
    token,
  })
}

export async function createExpense({
  token,
  locationId,
  payload,
}: {
  token: string
  locationId: string
  payload: {
    date: string
    categoryId: string
    concept: string
    amount: number
    method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'OTRO'
    counterpartyId?: string
    paidFromCash?: boolean
    notes?: string
  }
}) {
  return request<{ expense: ExpenseItem }>(`/locations/${locationId}/expenses`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function getLocationExpenses({
  token,
  locationId,
  from,
  to,
  categoryId,
}: {
  token: string
  locationId: string
  from?: string
  to?: string
  categoryId?: string
}) {
  const params = new URLSearchParams()
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (categoryId) params.set('categoryId', categoryId)
  const query = params.toString() ? `?${params.toString()}` : ''
  return request<{ items: ExpenseItem[] }>(`/locations/${locationId}/expenses${query}`, {
    method: 'GET',
    token,
  })
}

export async function deleteExpense({ token, expenseId }: { token: string; expenseId: string }) {
  return request<{ deleted: boolean }>(`/expenses/${expenseId}`, {
    method: 'DELETE',
    token,
  })
}


export type EnvelopeItem = {
  id: string
  businessId: string
  name: string
  targetAmount: string
  frequency: 'MONTHLY' | 'ONE_TIME'
  dueDay: number | null
  dueDate: string | null
  categoryId: string | null
  lastPaidAt: string | null
  active: boolean
  createdAt: string
  saved: number
  nextDue: string
  daysLeft: number
  remaining: number
  dailyNeeded: number
}

export type EnvelopesSummary = {
  items: EnvelopeItem[]
  totalDailyNeeded: number
  availableCashToday: number
}

export type EnvelopeMovementItem = {
  id: string
  envelopeId: string
  type: string
  date: string
  amount: string | number
  note?: string | null
  reason?: string | null
}
export async function getLocationPnl({
  token,
  locationId,
  month,
}: {
  token: string
  locationId: string
  month: string
}) {
  return request<PnlSummary>(`/locations/${locationId}/pnl?month=${encodeURIComponent(month)}`, {
    method: 'GET',
    token,
  })
}

export async function createEnvelope({
  token,
  businessId,
  payload,
}: {
  token: string
  businessId: string
  payload: {
    name: string
    targetAmount: number
    frequency: 'MONTHLY' | 'ONE_TIME'
    dueDay?: number
    dueDate?: string
    categoryId?: string
  }
}) {
  return request<{ envelope: EnvelopeItem }>(`/businesses/${businessId}/envelopes`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function getBusinessEnvelopes({
  token,
  businessId,
}: {
  token: string
  businessId: string
}) {
  return request<EnvelopesSummary>(`/businesses/${businessId}/envelopes`, {
    method: 'GET',
    token,
  })
}

export async function createEnvelopeDeposit({
  token,
  envelopeId,
  payload,
}: {
  token: string
  envelopeId: string
  payload: {
    date?: string
    amount: number
    note?: string
  }
}) {
  return request<{ deposit: { id: string } }>(`/envelopes/${envelopeId}/deposits`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function payEnvelope({
  token,
  envelopeId,
  payload,
}: {
  token: string
  envelopeId: string
  payload: {
    locationId: string
    date?: string
    amount?: number
    method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'APP' | 'OTRO'
  }
}) {
  return request<{ envelope: EnvelopeItem }>(`/envelopes/${envelopeId}/pay`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function deleteEnvelope({ token, envelopeId }: { token: string; envelopeId: string }) {
  return request<{ deleted: boolean; deactivated: boolean }>(`/envelopes/${envelopeId}`, {
    method: 'DELETE',
    token,
  })
}

export async function withdrawEnvelope({
  token,
  envelopeId,
  payload,
}: {
  token: string
  envelopeId: string
  payload: {
    amount: number
    reason: string
    date?: string
  }
}) {
  return request<{ ok: true }>(`/envelopes/${envelopeId}/withdraw`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function transferEnvelope({
  token,
  envelopeId,
  payload,
}: {
  token: string
  envelopeId: string
  payload: {
    toEnvelopeId: string
    amount: number
    note?: string
    date?: string
  }
}) {
  return request<{ ok: true }>(`/envelopes/${envelopeId}/transfer`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function getEnvelopeMovements({
  token,
  envelopeId,
}: {
  token: string
  envelopeId: string
}) {
  return request<{ items: EnvelopeMovementItem[] }>(`/envelopes/${envelopeId}/movements`, {
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
