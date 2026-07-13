const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  token?: string
}

export async function getMoneyAccountMovements({
  token,
  moneyAccountId,
  month,
}: {
  token: string
  moneyAccountId: string
  month: string
}) {
  const query = `?month=${encodeURIComponent(month)}`
  return request<MoneyAccountMovementsResponse>(`/money-accounts/${moneyAccountId}/movements${query}`, {
    method: 'GET',
    token,
  })
}

export type ChannelAccountMapItem = {
  channel: 'RAPPI' | 'UBER_EATS' | 'DIDI_FOOD' | 'PISO' | 'EVENTO' | 'OTRO'
  moneyAccountId: string | null
}

export async function getBusinessChannelAccountMap({
  token,
  businessId,
}: {
  token: string
  businessId: string
}) {
  return request<{
    defaultMoneyAccountId: string | null
    items: ChannelAccountMapItem[]
  }>(`/businesses/${businessId}/channel-account-map`, {
    method: 'GET',
    token,
  })
}

export async function putBusinessChannelAccountMap({
  token,
  businessId,
  payload,
}: {
  token: string
  businessId: string
  payload: {
    items: ChannelAccountMapItem[]
  }
}) {
  return request<{ items: ChannelAccountMapItem[] }>(`/businesses/${businessId}/channel-account-map`, {
    method: 'PUT',
    token,
    body: payload,
  })
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

export async function voidShift({
  token,
  shiftId,
  payload,
}: {
  token: string
  shiftId: string
  payload: {
    reason: string
  }
}) {
  return request<{
    shift: {
      id: string
      locationId: string
      date: string
      type: 'MATUTINO' | 'VESPERTINO' | 'NOCTURNO' | 'UNICO'
      voidedAt: string
      voidReason: string
      voidedBy: { id: string; name: string } | null
    }
  }>(`/shifts/${shiftId}/void`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function getBusinessMoneyAccounts({
  token,
  businessId,
  month,
}: {
  token: string
  businessId: string
  month?: string
}) {
  const query = month ? `?month=${encodeURIComponent(month)}` : ''
  return request<{
    month: string
    defaultMoneyAccountId: string | null
    items: MoneyAccountItem[]
  }>(`/businesses/${businessId}/money-accounts${query}`, {
    method: 'GET',
    token,
  })
}

export async function createBusinessMoneyAccount({
  token,
  businessId,
  payload,
}: {
  token: string
  businessId: string
  payload: {
    name: string
    kind?: 'TERMINAL' | 'CREDITO' | 'DEBITO'
    initialBalance?: number
    cardFeePct?: number
    cardFeeIvaPct?: number
  }
}) {
  return request<{ moneyAccount: MoneyAccountItem }>(`/businesses/${businessId}/money-accounts`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function patchBusinessMoneyAccount({
  token,
  businessId,
  moneyAccountId,
  payload,
}: {
  token: string
  businessId: string
  moneyAccountId: string
  payload: {
    name?: string
    kind?: 'TERMINAL' | 'CREDITO' | 'DEBITO'
    initialBalance?: number
    cardFeePct?: number
    cardFeeIvaPct?: number
    active?: boolean
  }
}) {
  return request<{ moneyAccount: MoneyAccountItem }>(
    `/businesses/${businessId}/money-accounts/${moneyAccountId}`,
    {
      method: 'PATCH',
      token,
      body: payload,
    },
  )
}

export async function deleteBusinessMoneyAccount({
  token,
  businessId,
  moneyAccountId,
}: {
  token: string
  businessId: string
  moneyAccountId: string
}) {
  return request<{
    action: 'DELETED' | 'DEACTIVATED'
    hadHistory: boolean
    defaultCleared: boolean
    history: {
      expenses: number
      payments: number
      mappedSales: number
      defaultFallbackSales: number
    }
    moneyAccount: {
      id: string
      name: string
      active: boolean
    }
  }>(`/businesses/${businessId}/money-accounts/${moneyAccountId}`, {
    method: 'DELETE',
    token,
  })
}

export async function patchBusinessDefaultMoneyAccount({
  token,
  businessId,
  payload,
}: {
  token: string
  businessId: string
  payload: {
    moneyAccountId?: string | null
  }
}) {
  return request<{ business: { id: string; defaultMoneyAccountId: string | null } }>(
    `/businesses/${businessId}/default-money-account`,
    {
      method: 'PATCH',
      token,
      body: payload,
    },
  )
}

export type MoneyAccountMovement = {
  id: string
  type: 'entrada' | 'salida'
  description: string
  date: string
  amount: number
  createdAt: string
  createdBy: {
    id: string
    name: string
    email: string
  } | null
}

export type MoneyAccountMovementDayGroup = {
  date: string
  entries: number
  outflows: number
  net: number
  movements: MoneyAccountMovement[]
}

export type MoneyAccountMovementsResponse = {
  month: string
  account: {
    id: string
    businessId: string
    name: string
    kind: 'TERMINAL' | 'CREDITO' | 'DEBITO'
    isDefault: boolean
  }
  totals: {
    entries: number
    outflows: number
    net: number
  }
  groupedByDay: MoneyAccountMovementDayGroup[]
  movements: MoneyAccountMovement[]
}

export type MoneyAccountItem = {
  id: string
  businessId: string
  name: string
  kind: 'TERMINAL' | 'CREDITO' | 'DEBITO'
  initialBalance: number
  cardFeePct: number
  cardFeeIvaPct: number
  active: boolean
  createdAt: string
  isDefault: boolean
  monthEntries: number
  monthCommission: number
  monthOutflows: number
  monthNet: number
  balance: number
}

export async function getBusinessPayables({
  token,
  businessId,
}: {
  token: string
  businessId: string
}) {
  return request<PayablesSummary>(`/businesses/${businessId}/payables`, {
    method: 'GET',
    token,
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

export type PurchaseItem = {
  id: string
  counterpartyId: string
  locationId: string | null
  kind: 'GOODS' | 'SERVICE' | 'LOAN'
  reference: string | null
  date: string
  dueDate: string | null
  total: string
  paidAmount: string
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED'
  requisitionId: string | null
  notes: string | null
}

export type CounterpartyPaymentItem = {
  id: string
  counterpartyId: string
  purchaseId: string | null
  moneyAccountId: string | null
  createdById: string | null
  date: string
  amount: string
  method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'APP' | 'OTRO'
  evidenceUrl: string | null
  notes: string | null
  createdAt: string
  createdBy?: {
    id: string
    name: string
  } | null
  moneyAccount?: {
    id: string
    name: string
    active: boolean
  } | null
}

export type PayablesSummary = {
  items: Array<{
    counterparty: {
      id: string
      name: string
      type: 'SUPPLIER' | 'LENDER'
      phone: string | null
      paymentTerms: string | null
      notes: string | null
    }
    saldo: number
    purchases: Array<{
      id: string
      createdById: string | null
      createdBy?: { id: string; name: string } | null
      kind: 'GOODS' | 'SERVICE' | 'LOAN'
      reference: string | null
      date: string
      dueDate: string | null
      total: string
      paidAmount: string
      status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED'
    }>
  }>
  totalPorPagar: number
  vencidos: number
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
  createdAt: string
  approvedAt: string | null
  receivedAt: string | null
  estimatedTotal: string
  receivedTotal: string | null
  notes: string | null
  expectedDate: string | null
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
    type?: 'SUPPLIER' | 'LENDER'
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


export async function createBusinessPurchase({
  token,
  businessId,
  payload,
}: {
  token: string
  businessId: string
  payload: {
    counterpartyId: string
    kind: 'GOODS' | 'SERVICE' | 'LOAN'
    reference?: string
    date: string
    dueDate?: string
    total: number
    notes?: string
    locationId?: string
  }
}) {
  return request<{ purchase: PurchaseItem }>(`/businesses/${businessId}/purchases`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function createPurchasePayment({
  token,
  purchaseId,
  payload,
}: {
  token: string
  purchaseId: string
  payload: {
    date: string
    amount: number
    method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'APP' | 'OTRO'
    moneyAccountId?: string
    envelopeId?: string
    evidenceUrl?: string
    notes?: string
    locationId?: string
    categoryId?: string
  }
}) {
  return request<{
    payment: CounterpartyPaymentItem
    purchase: PurchaseItem
    expense: ExpenseItem | null
  }>(`/purchases/${purchaseId}/payments`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function getPurchasePayments({
  token,
  purchaseId,
}: {
  token: string
  purchaseId: string
}) {
  return request<{ items: CounterpartyPaymentItem[] }>(`/purchases/${purchaseId}/payments`, {
    method: 'GET',
    token,
  })
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
    expectedDate?: string
    lines: Array<{ itemId: string; qty: number; unitPrice?: number }>
  }
}) {
  return request<{ requisition: RequisitionItem }>(`/locations/${locationId}/requisitions`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function createRequisitionBatch({
  token,
  locationId,
  payload,
}: {
  token: string
  locationId: string
  payload: {
    notes?: string
    expectedDate?: string
    lines: Array<{ itemId: string; qty: number; unitPrice?: number }>
  }
}) {
  return request<{ requisitions: RequisitionItem[] }>(`/locations/${locationId}/requisitions/batch`, {
    method: 'POST',
    token,
    body: payload,
  })
}

export async function patchRequisition({
  token,
  requisitionId,
  payload,
}: {
  token: string
  requisitionId: string
  payload: {
    counterpartyId: string
  }
}) {
  return request<{ requisition: RequisitionItem }>(`/requisitions/${requisitionId}`, {
    method: 'PATCH',
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
    receivedDate?: string
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
  moneyAccountId: string | null
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
  moneyAccount?: {
    id: string
    name: string
    active: boolean
  } | null
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
    moneyAccountId?: string
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
  cashBreakdown: Record<string, number> | null
  difference: string
  cashWithdrawn: string
  ticketCount: number | null
  notes: string | null
  evidenceUrls: string[]
  closedAt: string
  shift: {
    id: string
    date: string
    type: 'MATUTINO' | 'VESPERTINO' | 'NOCTURNO' | 'UNICO'
    voidedAt: string | null
    voidReason: string | null
    voidedBy: { id: string; name: string } | null
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
    cashBreakdown?: Record<string, number>
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

// ============================================================
// NÓMINA — empleados, asistencia, periodos
// ============================================================

export type Employee = {
  id: string
  businessId: string
  locationId: string | null
  name: string
  position: string
  payType: 'DAILY' | 'HOURLY' | 'FIXED'
  dailyRate: number | null
  hourlyRate: number | null
  biometricId: string | null
  active: boolean
  hiredAt: string | null
  schedule: Array<{ weekday: number; startTime: string }>
}

export type PayrollDay = {
  date: string
  clockInLabel: string | null
  clockOutLabel: string | null
  pactada: string | null
  tardinessMin: number
  hours: number
  dayPay: number
  dayDiscount: number
  missingPunch: 'ENTRADA' | 'SALIDA' | null
  dayFine: number
}

export type AttendanceRecordItem = {
  id: string
  clockIn: string
  clockOut: string | null
  hours: number
  source: 'BIOMETRIC' | 'MANUAL'
  adjusted: boolean
  shiftId: string | null
  notes: string | null
}

export type AttendanceEmployeeBucket = {
  employee: Employee
  days: Record<string, AttendanceRecordItem[]>
  totals: { days: number; hours: number }
}

export type PayrollPeriodItem = {
  id: string
  businessId: string
  startDate: string
  endDate: string
  status: 'DRAFT' | 'REVIEW' | 'CLOSED'
  closedAt: string | null
  total?: number
}

export type PayrollRow = {
  employeeId: string
  employee: { id: string; name: string; position: string; locationId: string | null; payType: string; dailyRate: number | null; hourlyRate?: number | null }
  daysWorked: number
  regularHours: number
  basePay: number
  overtimePay: number
  bonuses: number
  tips: number
  deductions: number
  tardinessMinutes: number
  tardinessDiscount: number
  noCheckCount: number
  noCheckFine: number
  total: number
  notes: string | null
  days: PayrollDay[]
}

export async function getEmployees({ token, businessId, includeInactive = false }: { token: string; businessId: string; includeInactive?: boolean }) {
  const query = includeInactive ? '?includeInactive=true' : ''
  return request<{ items: Employee[] }>(`/businesses/${businessId}/employees${query}`, { method: 'GET', token })
}

export async function createEmployee({ token, businessId, payload }: {
  token: string; businessId: string
  payload: { name: string; position: string; payType?: 'DAILY' | 'HOURLY' | 'FIXED'; dailyRate?: number; hourlyRate?: number; biometricId?: string; locationId?: string | null; hiredAt?: string }
}) {
  return request<{ employee: Employee }>(`/businesses/${businessId}/employees`, { method: 'POST', token, body: payload })
}

export async function patchEmployee({ token, businessId, employeeId, payload }: {
  token: string; businessId: string; employeeId: string
  payload: { name?: string; position?: string; payType?: 'DAILY' | 'HOURLY' | 'FIXED'; dailyRate?: number | null; hourlyRate?: number | null; biometricId?: string | null; locationId?: string | null; hiredAt?: string | null; active?: boolean }
}) {
  return request<{ employee: Employee }>(`/businesses/${businessId}/employees/${employeeId}`, { method: 'PATCH', token, body: payload })
}

export async function deleteEmployee({ token, businessId, employeeId }: { token: string; businessId: string; employeeId: string }) {
  return request<{ deleted: boolean; deactivated: boolean; message: string }>(`/businesses/${businessId}/employees/${employeeId}`, { method: 'DELETE', token })
}

export type SettlementConcept = { key: string; label: string; dias?: number; monto: number }

export type Settlement = {
  employee: { id: string; name: string; position: string; payType: string }
  hiredAt: string
  lastDay: string
  mode: 'renuncia' | 'despido'
  dailySalary: number
  dailySalaryIntegrated: number
  pendingDays: number
  antiguedad: { years: number; months: number; days: number; label: string; totalDays: number; yearsDecimal: number }
  conceptos: SettlementConcept[]
  total: number
  assumptions: string[]
}

export async function getSettlement({ token, employeeId, lastDay, dailySalary, mode, pendingDays = 0 }: {
  token: string; employeeId: string; lastDay: string; dailySalary: number; mode: 'renuncia' | 'despido'; pendingDays?: number
}) {
  const params = new URLSearchParams({ lastDay, dailySalary: String(dailySalary), mode, pendingDays: String(pendingDays) })
  return request<Settlement>(`/employees/${employeeId}/settlement?${params.toString()}`, { method: 'GET', token })
}

export async function putEmployeeSchedule({ token, employeeId, schedule }: {
  token: string; employeeId: string; schedule: Array<{ weekday: number; startTime: string }>
}) {
  return request<{ schedule: Array<{ weekday: number; startTime: string }> }>(`/employees/${employeeId}/schedule`, { method: 'PUT', token, body: { schedule } })
}

export async function getLocationAttendance({ token, locationId, from, to }: { token: string; locationId: string; from: string; to: string }) {
  const params = new URLSearchParams({ from, to })
  return request<{ items: AttendanceEmployeeBucket[] }>(`/locations/${locationId}/attendance?${params.toString()}`, { method: 'GET', token })
}

export async function createAttendance({ token, employeeId, payload }: {
  token: string; employeeId: string
  payload: { clockIn: string; clockOut?: string; shiftId?: string; notes?: string }
}) {
  return request<{ attendance: AttendanceRecordItem }>(`/employees/${employeeId}/attendance`, { method: 'POST', token, body: payload })
}

export async function patchAttendance({ token, attendanceId, payload }: {
  token: string; attendanceId: string
  payload: { clockIn?: string; clockOut?: string | null; notes?: string | null }
}) {
  return request<{ attendance: AttendanceRecordItem }>(`/attendance/${attendanceId}`, { method: 'PATCH', token, body: payload })
}

export async function deleteAttendance({ token, attendanceId }: { token: string; attendanceId: string }) {
  return request<{ deleted: boolean }>(`/attendance/${attendanceId}`, { method: 'DELETE', token })
}

export async function importAttendance({ token, locationId, payload }: {
  token: string; locationId: string
  payload: { offsetHours: number; rows: Array<{ biometricId: string; timestamp: string }> }
}) {
  return request<{ creados: number; saltados: number; sinEmpleado: string[]; offsetHours: number }>(`/locations/${locationId}/attendance/import`, { method: 'POST', token, body: payload })
}

export async function getPayrollPeriods({ token, businessId }: { token: string; businessId: string }) {
  return request<{ items: PayrollPeriodItem[] }>(`/businesses/${businessId}/payroll-periods`, { method: 'GET', token })
}

export async function createPayrollPeriod({ token, businessId, payload }: {
  token: string; businessId: string; payload: { startDate: string; endDate: string }
}) {
  return request<{ period: PayrollPeriodItem }>(`/businesses/${businessId}/payroll-periods`, { method: 'POST', token, body: payload })
}

export async function getPayrollPeriod({ token, periodId }: { token: string; periodId: string }) {
  return request<{ period: PayrollPeriodItem; rows: PayrollRow[] }>(`/payroll-periods/${periodId}`, { method: 'GET', token })
}

export async function putPayrollEntry({ token, periodId, employeeId, payload }: {
  token: string; periodId: string; employeeId: string
  payload: { overtimePay?: number; bonuses?: number; tips?: number; deductions?: number; notes?: string | null }
}) {
  return request<{ entry: unknown }>(`/payroll-periods/${periodId}/entries/${employeeId}`, { method: 'PUT', token, body: payload })
}

export async function closePayrollPeriod({ token, periodId }: { token: string; periodId: string }) {
  return request<{ period: PayrollPeriodItem; expenses: unknown[] }>(`/payroll-periods/${periodId}/close`, { method: 'POST', token })
}

export async function reopenPayrollPeriod({ token, periodId }: { token: string; periodId: string }) {
  return request<{ period: PayrollPeriodItem; deletedExpenses: number }>(`/payroll-periods/${periodId}/reopen`, { method: 'POST', token })
}
