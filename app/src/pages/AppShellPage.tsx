import type { FormEvent } from 'react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  approveRequisition,
  cancelRequisition,
  createBusinessCounterparty,
  createBusinessItem,
  createBusinessMember,
  createBusinessPurchase,
  createRequisitionBatch,
  createEnvelope,
  createEnvelopeDeposit,
  createExpense,
  createPurchasePayment,
  createShiftClosing,
  deleteEnvelope,
  deleteExpense,
  deleteBusinessCounterparty,
  deleteBusinessItem,
  getBusinessEnvelopes,
  getEnvelopeMovements,
  getExpenseCategories,
  getBusinessCounterparties,
  getBusinessItems,
  getDashboardSummary,
  getBusinessMembers,
  getBusinessPayables,
  getLocationExpenses,
  getLocationPnl,
  getLocationRequisitions,
  getPurchasePayments,
  payEnvelope,
  patchBusinessCounterparty,
  patchBusinessItem,
  patchRequisition,
  receiveRequisition,
  transferEnvelope,
  getShiftClosings,
  getWaitlist,
  withdrawEnvelope,
  type BusinessMember,
  type BusinessItem,
  type CounterpartyPaymentItem,
  type Counterparty,
  type DashboardSummary,
  type EnvelopeItem,
  type EnvelopeMovementItem,
  type ExpenseCategory,
  type ExpenseItem,
  type EnvelopesSummary,
  type PayablesSummary,
  type PnlSummary,
  type RequisitionItem,
  type RequisitionStatus,
  type ShiftClosingItem,
  type WaitlistLead,
} from '../lib/api'
import { useAuth } from '../state/auth'

const navGroups = [
  {
    title: 'Operación',
    items: ['Dashboard', 'Cierres de turno', 'Requisiciones'],
  },
  {
    title: 'Dinero',
    items: ['Proveedores y adeudos', 'Nómina', 'Gastos', 'Sobres', 'P&L y reportes'],
  },
]
const configGroup = {
  title: 'Configuración',
  items: ['Equipo'],
}
const superAdminGroup = {
  title: 'Quadre HQ',
  items: ['Waitlist'],
}

const shiftTypeOptions = ['MATUTINO', 'VESPERTINO', 'NOCTURNO', 'UNICO'] as const
const lineChannels = ['PISO', 'RAPPI', 'UBER_EATS', 'DIDI_FOOD', 'EVENTO', 'OTRO'] as const
const lineMethods = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'APP', 'OTRO'] as const
const defaultFeeByChannel: Record<(typeof lineChannels)[number], number> = {
  PISO: 0,
  EVENTO: 0,
  OTRO: 0,
  RAPPI: 34.8,
  UBER_EATS: 34.8,
  DIDI_FOOD: 34.8,
}
const cashDenominationOptions = [
  { key: '1000', label: '$1,000', value: 1000, kind: 'Billete' },
  { key: '500', label: '$500', value: 500, kind: 'Billete' },
  { key: '200', label: '$200', value: 200, kind: 'Billete' },
  { key: '100', label: '$100', value: 100, kind: 'Billete' },
  { key: '50', label: '$50', value: 50, kind: 'Billete' },
  { key: '20_bill', label: '$20', value: 20, kind: 'Billete' },
  { key: '20_coin', label: '$20', value: 20, kind: 'Moneda' },
  { key: '10', label: '$10', value: 10, kind: 'Moneda' },
  { key: '5', label: '$5', value: 5, kind: 'Moneda' },
  { key: '2', label: '$2', value: 2, kind: 'Moneda' },
  { key: '1', label: '$1', value: 1, kind: 'Moneda' },
  { key: '0.5', label: '$0.50', value: 0.5, kind: 'Moneda' },
] as const

type ShiftLineDraft = {
  channel: (typeof lineChannels)[number]
  method: (typeof lineMethods)[number]
  gross: number
  feePct: number
}

type ClosingDraft = {
  date: string
  type: (typeof shiftTypeOptions)[number]
  openingCash: number
  cashWithdrawn: number
  countedCash: number
  notes: string
  lines: ShiftLineDraft[]
}

type ClosingCashBreakdown = Record<string, number>

type RequisitionsFilter = 'ACTIVE' | 'RECEIVED' | 'ALL'
type RequisitionsTab = 'REQUISITIONS' | 'CATALOG'

type RequisitionLineDraft = {
  itemId: string
  qty: number
  unitPrice: number
}

type NewRequisitionDraft = {
  counterpartyId: string
  notes: string
  expectedDate: string
  lines: RequisitionLineDraft[]
}

type ReceiveLineDraft = {
  lineId: string
  itemName: string
  qty: number
  unitPrice: number
  receivedQty: number
  actualPrice: number
}

type ReceiveDraft = {
  counterpartyId: string
  receivedDate: string
  lines: ReceiveLineDraft[]
}

type QuickItemDraft = {
  name: string
  unit: BusinessItem['unit']
  lastPrice: number
}

type ExpenseDraft = {
  date: string
  categoryId: string
  concept: string
  amount: number
  method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'OTRO'
  counterpartyId: string
  paidFromCash: boolean
}

type EnvelopeDraft = {
  name: string
  targetAmount: number
  frequency: 'MONTHLY' | 'ONE_TIME'
  dueDay: number
  dueDate: string
  categoryId: string
}

type EnvelopeDepositDraft = {
  amount: number
  note: string
}

type EnvelopePayDraft = {
  locationId: string
  date: string
  amount: number
  method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'APP' | 'OTRO'
}

type EnvelopeWithdrawDraft = {
  amount: number
  reason: string
}

type EnvelopeTransferDraft = {
  toEnvelopeId: string
  amount: number
  note: string
}

type PayableCreateDraft = {
  counterpartyId: string
  kind: 'GOODS' | 'SERVICE' | 'LOAN'
  reference: string
  date: string
  dueDate: string
  total: number
  notes: string
  locationId: string
}

type PayablePaymentDraft = {
  date: string
  amount: number
  method: 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA' | 'APP' | 'OTRO'
  notes: string
  locationId: string
  categoryId: string
}

type PayableCounterpartyDraft = {
  name: string
  type: 'SUPPLIER' | 'LENDER'
  phone: string
}
type RequisitionAssignDraft = {
  counterpartyId: string
  showInlineCreate: boolean
}
type RequisitionTicketLine = {
  qty: number
  unit: string
  name: string
  subtotal: number
}
type RequisitionTicketGroup = {
  providerName: string
  lines: RequisitionTicketLine[]
  subtotal: number
}
type RequisitionTicketSummary = {
  businessName: string
  dateLabel: string
  dateKey: string
  groups: RequisitionTicketGroup[]
  total: number
}

const requisitionFilterOptions: Array<{ key: RequisitionsFilter; label: string }> = [
  { key: 'ACTIVE', label: 'Activas' },
  { key: 'RECEIVED', label: 'Recibidas' },
  { key: 'ALL', label: 'Todas' },
]

const quickItemUnits: Array<BusinessItem['unit']> = [
  'PZA',
  'KG',
  'G',
  'LT',
  'ML',
  'CAJA',
  'PAQUETE',
  'BOTELLA',
]

const defaultShiftLine: ShiftLineDraft = {
  channel: 'PISO',
  method: 'EFECTIVO',
  gross: 0,
  feePct: defaultFeeByChannel.PISO,
}

function getTodayDateInput() {
  const now = new Date()
  const tzOffsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - tzOffsetMs).toISOString().slice(0, 10)
}

function getMexicoTodayDateInput() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
  }).format(new Date())
}

function getMexicoTomorrowDateInput() {
  const [year, month, day] = getMexicoTodayDateInput().split('-').map(Number)
  if (!year || !month || !day) return getTodayDateInput()
  const tomorrow = new Date(Date.UTC(year, month - 1, day))
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const nextYear = tomorrow.getUTCFullYear()
  const nextMonth = String(tomorrow.getUTCMonth() + 1).padStart(2, '0')
  const nextDay = String(tomorrow.getUTCDate()).padStart(2, '0')
  return `${nextYear}-${nextMonth}-${nextDay}`
}

function getStartOfWeek(date: Date) {
  const result = new Date(date)
  const day = result.getDay()
  const diff = day === 0 ? -6 : 1 - day
  result.setDate(result.getDate() + diff)
  result.setHours(0, 0, 0, 0)
  return result
}

function getStartOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function toDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getCurrentMonthInput() {
  return getTodayDateInput().slice(0, 7)
}

function shiftMonth(month: string, delta: number) {
  const [yearString, monthString] = month.split('-')
  const year = Number(yearString)
  const monthIndex = Number(monthString) - 1
  const next = new Date(year, monthIndex + delta, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

function getMonthBounds(month: string) {
  const [yearString, monthString] = month.split('-')
  const year = Number(yearString)
  const monthIndex = Number(monthString) - 1
  const from = `${month}-01`
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const to = `${month}-${String(lastDay).padStart(2, '0')}`
  return { from, to }
}

function formatMonthLabel(month: string) {
  const [yearString, monthString] = month.split('-')
  const date = new Date(Number(yearString), Number(monthString) - 1, 1)
  const label = new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric',
  }).format(date)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function asNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asDecimal(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getCashBreakdownTotal(cashBreakdown: ClosingCashBreakdown) {
  return Number(
    cashDenominationOptions
      .reduce((sum, denomination) => sum + denomination.value * (cashBreakdown[denomination.key] || 0), 0)
      .toFixed(2),
  )
}

function sanitizeCashBreakdownForPayload(cashBreakdown: ClosingCashBreakdown) {
  return cashDenominationOptions.reduce<Record<string, number>>((acc, denomination) => {
    const quantity = Math.max(Math.floor(cashBreakdown[denomination.key] || 0), 0)
    if (quantity > 0) acc[denomination.key] = quantity
    return acc
  }, {})
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatShiftType(type: string) {
  return type.charAt(0) + type.slice(1).toLowerCase()
}

function formatRequisitionStatus(status: RequisitionStatus) {
  if (status === 'PENDING_APPROVAL') return 'Por aprobar'
  if (status === 'APPROVED') return 'Aprobada'
  if (status === 'RECEIVED') return 'Recibida'
  if (status === 'CANCELLED') return 'Cancelada'
  if (status === 'ORDERED') return 'Aprobada'
  return 'Por aprobar'
}

function requisitionStatusChipClass(status: RequisitionStatus) {
  if (status === 'RECEIVED') return 'ok'
  if (status === 'CANCELLED') return 'falt'
  return 'pending'
}
function formatTeamRole(role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'STAFF') {
  if (role === 'OWNER') return 'Owner'
  if (role === 'ADMIN') return 'Administrador'
  if (role === 'MANAGER') return 'Gerente'
  return 'Staff'
}

function formatPayableKind(kind: 'GOODS' | 'SERVICE' | 'LOAN') {
  if (kind === 'GOODS') return 'Insumo'
  if (kind === 'SERVICE') return 'Servicio'
  return 'Préstamo'
}

function formatPayableStatus(status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED') {
  if (status === 'PENDING') return 'Pendiente'
  if (status === 'PARTIAL') return 'Parcial'
  if (status === 'PAID') return 'Pagado'
  return 'Cancelado'
}

function payableStatusChipClass(status: 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED') {
  if (status === 'PAID') return 'ok'
  if (status === 'CANCELLED') return 'falt'
  if (status === 'PARTIAL') return 'pending'
  return 'pending'
}
function formatDateFromIsoString(dateValue: string) {
  const dateOnly = dateValue.slice(0, 10)
  const [year, month, day] = dateOnly.split('-')
  if (!year || !month || !day) return dateValue
  return `${day}/${month}/${year}`
}

function formatDayMonthFromIsoString(dateValue: string) {
  const dateOnly = dateValue.slice(0, 10)
  const [year, month, day] = dateOnly.split('-')
  if (!year || !month || !day) return dateValue
  return `${day}/${month}`
}

function isRequisitionOverdue(expectedDate: string | null, status: RequisitionStatus) {
  if (!expectedDate) return false
  if (status === 'RECEIVED' || status === 'CANCELLED') return false
  return expectedDate.slice(0, 10) < getMexicoTodayDateInput()
}

function formatEnvelopeMovementType(type: string) {
  const normalized = type.trim().toUpperCase()
  if (normalized === 'DEPOSIT') return 'Abono'
  if (normalized === 'PAY' || normalized === 'PAYMENT') return 'Pago'
  if (normalized === 'WITHDRAW') return 'Retiro'
  if (normalized === 'TRANSFER_OUT') return 'Transferencia enviada'
  if (normalized === 'TRANSFER_IN') return 'Transferencia recibida'
  return type
}

function getEnvelopeMovementSignedAmount(movement: EnvelopeMovementItem) {
  const amount = asDecimal(movement.amount)
  const normalized = movement.type.trim().toUpperCase()
  if (normalized === 'DEPOSIT' || normalized === 'TRANSFER_IN') return amount
  if (normalized === 'PAY' || normalized === 'PAYMENT' || normalized === 'WITHDRAW' || normalized === 'TRANSFER_OUT')
    return amount * -1
  return amount
}
function sanitizeDigits(value: string) {
  return value.replace(/\D/g, '')
}

function getFirstName(name: string) {
  const [firstName] = name.trim().split(/\s+/)
  return firstName || 'hola'
}

function buildWhatsappUrl(lead: WaitlistLead) {
  if (!lead.whatsapp) return null
  const digits = sanitizeDigits(lead.whatsapp)
  if (!digits) return null
  const message = `¡Hola ${getFirstName(
    lead.name,
  )}! Soy María, fundadora de Quadre 👋 Vi que te registraste en la lista de espera...`
  return `https://wa.me/52${digits}?text=${encodeURIComponent(message)}`
}

function buildOrderWhatsappUrl({
  phone,
  businessName,
  requisition,
}: {
  phone: string
  businessName: string
  requisition: RequisitionItem
}) {
  const digits = sanitizeDigits(phone)
  if (!digits) return null
  const linesText = requisition.lines
    .map((line) => `• ${asDecimal(line.qty)} ${line.item.unit} ${line.item.name}`)
    .join('\n')
  const message = `¡Hola! Te mando pedido de ${businessName} 🙌\nRequisición #${requisition.folio}:\n${linesText}\n¿Me confirmas disponibilidad y total? ¡Gracias!`
  return `https://wa.me/52${digits}?text=${encodeURIComponent(message)}`
}

function getTotals(draft: ClosingDraft) {
  const efectivoVentas = draft.lines
    .filter((line) => line.method === 'EFECTIVO')
    .reduce((sum, line) => sum + line.gross, 0)

  const expectedCash = draft.openingCash + efectivoVentas - draft.cashWithdrawn
  const difference = draft.countedCash - expectedCash
  return { expectedCash, difference }
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png')
  })
}

function drawRequisitionTicket(summary: RequisitionTicketSummary) {
  const rootStyles = getComputedStyle(document.documentElement)
  const tinta = rootStyles.getPropertyValue('--tinta').trim() || '#1a2f38'
  const cuadro = rootStyles.getPropertyValue('--cuadro').trim() || '#f0d96a'
  const papel = rootStyles.getPropertyValue('--papel').trim() || '#f5f2ea'
  const blanco = rootStyles.getPropertyValue('--blanco').trim() || '#ffffff'

  const width = 800
  const paddingX = 42
  const lineHeight = 30
  const rows =
    4 +
    summary.groups.reduce((sum, group) => {
      return sum + 2 + group.lines.length + 1
    }, 0) +
    3
  const height = Math.max(420, 60 + rows * lineHeight)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.fillStyle = tinta
  ctx.fillRect(0, 0, width, height)

  const drawSawtooth = (top: boolean) => {
    const step = 26
    const depth = 12
    ctx.fillStyle = papel
    for (let x = 0; x < width; x += step) {
      ctx.beginPath()
      if (top) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x + step / 2, depth)
        ctx.lineTo(x + step, 0)
      } else {
        ctx.moveTo(x, height)
        ctx.lineTo(x + step / 2, height - depth)
        ctx.lineTo(x + step, height)
      }
      ctx.closePath()
      ctx.fill()
    }
  }
  drawSawtooth(true)
  drawSawtooth(false)

  const mono = '600 20px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  const monoSmall = '500 17px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  const monoTiny = '500 15px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  let y = 44

  ctx.fillStyle = cuadro
  ctx.font = mono
  ctx.textAlign = 'left'
  ctx.fillText(`PEDIDO · ${summary.businessName.toUpperCase()}`, paddingX, y)
  y += lineHeight

  ctx.fillStyle = blanco
  ctx.font = monoSmall
  ctx.fillText(summary.dateLabel, paddingX, y)
  y += lineHeight + 6

  const dottedSeparator = () => {
    ctx.strokeStyle = cuadro
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.moveTo(paddingX, y)
    ctx.lineTo(width - paddingX, y)
    ctx.stroke()
    ctx.setLineDash([])
    y += 14
  }

  const fitLeftText = (text: string, maxWidth: number) => {
    if (ctx.measureText(text).width <= maxWidth) return text
    let result = text
    while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
      result = result.slice(0, -1)
    }
    return `${result}…`
  }

  summary.groups.forEach((group) => {
    ctx.fillStyle = cuadro
    ctx.font = monoSmall
    ctx.textAlign = 'left'
    ctx.fillText(group.providerName.toUpperCase(), paddingX, y)
    y += lineHeight - 4
    dottedSeparator()

    group.lines.forEach((line) => {
      ctx.fillStyle = blanco
      ctx.font = monoTiny
      ctx.textAlign = 'left'
      const leftText = `${line.qty} ${line.unit} ${line.name}`
      const rightText = formatMoney(line.subtotal)
      const rightX = width - paddingX
      const leftMaxWidth = rightX - paddingX - ctx.measureText(rightText).width - 24
      ctx.fillText(fitLeftText(leftText, leftMaxWidth), paddingX, y)
      ctx.textAlign = 'right'
      ctx.fillText(rightText, rightX, y)
      y += lineHeight - 4
    })

    ctx.fillStyle = cuadro
    ctx.font = monoTiny
    ctx.textAlign = 'right'
    ctx.fillText(`SUBTOTAL ${formatMoney(group.subtotal)}`, width - paddingX, y)
    y += lineHeight
  })

  dottedSeparator()
  ctx.fillStyle = blanco
  ctx.font = monoSmall
  ctx.textAlign = 'right'
  ctx.fillText(`TOTAL ${formatMoney(summary.total)}`, width - paddingX, y)
  y += lineHeight + 8

  ctx.fillStyle = cuadro
  ctx.font = monoTiny
  ctx.textAlign = 'left'
  ctx.fillText('quadre.mx ✓', paddingX, y)

  return canvas
}

export function AppShellPage() {
  const { logout, memberships, loadingUser, refreshMe, user, token } = useAuth()
  const [selectedBusinessId, setSelectedBusinessId] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [activeItem, setActiveItem] = useState('Dashboard')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const [closings, setClosings] = useState<ShiftClosingItem[]>([])
  const [loadingClosings, setLoadingClosings] = useState(false)
  const [closingsError, setClosingsError] = useState('')
  const [closingsRange, setClosingsRange] = useState<'week' | 'month'>('week')
  const [showCloseForm, setShowCloseForm] = useState(false)
  const [savingClose, setSavingClose] = useState(false)
  const [closeError, setCloseError] = useState('')
  const [waitlistLeads, setWaitlistLeads] = useState<WaitlistLead[]>([])
  const [loadingWaitlist, setLoadingWaitlist] = useState(false)
  const [waitlistError, setWaitlistError] = useState('')
  const [teamMembers, setTeamMembers] = useState<BusinessMember[]>([])
  const [loadingTeam, setLoadingTeam] = useState(false)
  const [teamError, setTeamError] = useState('')
  const [showAddMemberForm, setShowAddMemberForm] = useState(false)
  const [savingMember, setSavingMember] = useState(false)
  const [addMemberError, setAddMemberError] = useState('')
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [dashboardError, setDashboardError] = useState('')
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([])
  const [expenses, setExpenses] = useState<ExpenseItem[]>([])
  const [loadingExpenses, setLoadingExpenses] = useState(false)
  const [expensesError, setExpensesError] = useState('')
  const [expensesSuccess, setExpensesSuccess] = useState('')
  const [payablesSummary, setPayablesSummary] = useState<PayablesSummary | null>(null)
  const [loadingPayables, setLoadingPayables] = useState(false)
  const [payablesError, setPayablesError] = useState('')
  const [payablesSuccess, setPayablesSuccess] = useState('')
  const [savingPayables, setSavingPayables] = useState(false)
  const [showPayableForm, setShowPayableForm] = useState(false)
  const [showInlinePayableCounterpartyForm, setShowInlinePayableCounterpartyForm] = useState(false)
  const [expandedCounterpartyId, setExpandedCounterpartyId] = useState('')
  const [activePayPurchaseId, setActivePayPurchaseId] = useState('')
  const [purchasePaymentsByPurchase, setPurchasePaymentsByPurchase] = useState<
    Record<string, CounterpartyPaymentItem[]>
  >({})
  const [loadingPaymentsByPurchase, setLoadingPaymentsByPurchase] = useState<Record<string, boolean>>({})
  const [pnlSummary, setPnlSummary] = useState<PnlSummary | null>(null)
  const [loadingPnl, setLoadingPnl] = useState(false)
  const [pnlError, setPnlError] = useState('')
  const [envelopesSummary, setEnvelopesSummary] = useState<EnvelopesSummary | null>(null)
  const [loadingEnvelopes, setLoadingEnvelopes] = useState(false)
  const [envelopesError, setEnvelopesError] = useState('')
  const [envelopesSuccess, setEnvelopesSuccess] = useState('')
  const [savingEnvelope, setSavingEnvelope] = useState(false)
  const [showEnvelopeForm, setShowEnvelopeForm] = useState(false)
  const [activeDepositEnvelopeId, setActiveDepositEnvelopeId] = useState('')
  const [activePayEnvelopeId, setActivePayEnvelopeId] = useState('')
  const [activeWithdrawEnvelopeId, setActiveWithdrawEnvelopeId] = useState('')
  const [activeTransferEnvelopeId, setActiveTransferEnvelopeId] = useState('')
  const [activeMovementsEnvelopeId, setActiveMovementsEnvelopeId] = useState('')
  const [loadingEnvelopeMovements, setLoadingEnvelopeMovements] = useState(false)
  const [envelopeDraft, setEnvelopeDraft] = useState<EnvelopeDraft>({
    name: '',
    targetAmount: 0,
    frequency: 'MONTHLY',
    dueDay: 10,
    dueDate: getTodayDateInput(),
    categoryId: '',
  })
  const [depositDraftByEnvelope, setDepositDraftByEnvelope] = useState<Record<string, EnvelopeDepositDraft>>({})
  const [payDraftByEnvelope, setPayDraftByEnvelope] = useState<Record<string, EnvelopePayDraft>>({})
  const [withdrawDraftByEnvelope, setWithdrawDraftByEnvelope] = useState<Record<string, EnvelopeWithdrawDraft>>({})
  const [transferDraftByEnvelope, setTransferDraftByEnvelope] = useState<Record<string, EnvelopeTransferDraft>>({})
  const [envelopeMovementsByEnvelope, setEnvelopeMovementsByEnvelope] = useState<
    Record<string, EnvelopeMovementItem[]>
  >({})
  const [gastosMonth, setGastosMonth] = useState(getCurrentMonthInput())
  const [pnlMonth, setPnlMonth] = useState(getCurrentMonthInput())
  const [expensesCategoryFilter, setExpensesCategoryFilter] = useState('')
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [savingExpense, setSavingExpense] = useState(false)
  const [expenseDraft, setExpenseDraft] = useState<ExpenseDraft>({
    date: getTodayDateInput(),
    categoryId: '',
    concept: '',
    amount: 0,
    method: 'EFECTIVO',
    counterpartyId: '',
    paidFromCash: false,
  })
  const [payableCreateDraft, setPayableCreateDraft] = useState<PayableCreateDraft>({
    counterpartyId: '',
    kind: 'GOODS',
    reference: '',
    date: getTodayDateInput(),
    dueDate: getTodayDateInput(),
    total: 0,
    notes: '',
    locationId: '',
  })
  const [payablePaymentDraftByPurchase, setPayablePaymentDraftByPurchase] = useState<
    Record<string, PayablePaymentDraft>
  >({})
  const [payableCounterpartyDraft, setPayableCounterpartyDraft] = useState<PayableCounterpartyDraft>({
    name: '',
    type: 'SUPPLIER',
    phone: '',
  })
  const [requisitions, setRequisitions] = useState<RequisitionItem[]>([])
  const [loadingRequisitions, setLoadingRequisitions] = useState(false)
  const [requisitionsError, setRequisitionsError] = useState('')
  const [requisitionsFilter, setRequisitionsFilter] = useState<RequisitionsFilter>('ACTIVE')
  const [activeRequisitionsTab, setActiveRequisitionsTab] = useState<RequisitionsTab>('REQUISITIONS')
  const [businessItems, setBusinessItems] = useState<BusinessItem[]>([])
  const [counterparties, setCounterparties] = useState<Counterparty[]>([])
  const [savingCatalog, setSavingCatalog] = useState(false)
  const [editingItemId, setEditingItemId] = useState('')
  const [editingCounterpartyId, setEditingCounterpartyId] = useState('')
  const [phoneCaptureCounterpartyId, setPhoneCaptureCounterpartyId] = useState('')
  const [phoneCaptureValue, setPhoneCaptureValue] = useState('')
  const [showRequisitionForm, setShowRequisitionForm] = useState(false)
  const [requisitionSearch, setRequisitionSearch] = useState('')
  const [requisitionSearchQty, setRequisitionSearchQty] = useState(1)
  const [expandedRequisitionId, setExpandedRequisitionId] = useState('')
  const [assignDraftByRequisitionId, setAssignDraftByRequisitionId] = useState<Record<string, RequisitionAssignDraft>>({})
  const [requisitionCounterpartyDraft, setRequisitionCounterpartyDraft] = useState<PayableCounterpartyDraft>({
    name: '',
    type: 'SUPPLIER',
    phone: '',
  })
  const [lastCreatedRequisitionItems, setLastCreatedRequisitionItems] = useState<RequisitionItem[]>([])
  const [summaryPreview, setSummaryPreview] = useState<{ url: string; file: File; filename: string } | null>(null)
  const [creatingSummaryImage, setCreatingSummaryImage] = useState(false)
  const [savingRequisition, setSavingRequisition] = useState(false)
  const [requisitionFormError, setRequisitionFormError] = useState('')
  const [requisitionsSuccess, setRequisitionsSuccess] = useState('')
  const [rowActionLoadingId, setRowActionLoadingId] = useState('')
  const [showInactiveItems, setShowInactiveItems] = useState(false)
  const [showInactiveCounterparties, setShowInactiveCounterparties] = useState(false)
  const [quickItemDraft, setQuickItemDraft] = useState<QuickItemDraft>({
    name: '',
    unit: 'PZA',
    lastPrice: 0,
  })
  const [catalogItemDraft, setCatalogItemDraft] = useState({
    name: '',
    unit: 'PZA' as BusinessItem['unit'],
    category: '',
    lastPrice: 0,
    defaultCounterpartyId: '',
  })
  const [catalogCounterpartyDraft, setCatalogCounterpartyDraft] = useState({
    name: '',
    phone: '',
    paymentTerms: '',
    notes: '',
  })
  const [savingQuickItem, setSavingQuickItem] = useState(false)
  const [quickItemError, setQuickItemError] = useState('')
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [receiveTarget, setReceiveTarget] = useState<RequisitionItem | null>(null)
  const [savingReceive, setSavingReceive] = useState(false)
  const [receiveError, setReceiveError] = useState('')
  const [newRequisitionDraft, setNewRequisitionDraft] = useState<NewRequisitionDraft>({
    counterpartyId: '',
    notes: '',
    expectedDate: getMexicoTomorrowDateInput(),
    lines: [],
  })
  const [receiveDraft, setReceiveDraft] = useState<ReceiveDraft>({
    counterpartyId: '',
    receivedDate: getMexicoTodayDateInput(),
    lines: [],
  })
  const [memberForm, setMemberForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'MANAGER' as 'ADMIN' | 'MANAGER' | 'STAFF',
    locationId: 'ALL',
  })
  const [closeDraft, setCloseDraft] = useState<ClosingDraft>({
    date: getTodayDateInput(),
    type: 'UNICO',
    openingCash: 1500,
    cashWithdrawn: 0,
    countedCash: 0,
    notes: '',
    lines: [{ ...defaultShiftLine }],
  })
  const [useCashBreakdownMode, setUseCashBreakdownMode] = useState(false)
  const [closeCashBreakdown, setCloseCashBreakdown] = useState<ClosingCashBreakdown>({})

  useEffect(() => {
    if (!memberships.length) {
      refreshMe().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!selectedBusinessId && memberships.length) {
      setSelectedBusinessId(memberships[0].business.id)
    }
  }, [memberships, selectedBusinessId])

  const selectedBusiness = useMemo(
    () => memberships.find((m) => m.business.id === selectedBusinessId)?.business,
    [memberships, selectedBusinessId],
  )
  const selectedBusinessMembership = useMemo(
    () => memberships.find((m) => m.business.id === selectedBusinessId) || null,
    [memberships, selectedBusinessId],
  )
  const canManageTeam = selectedBusinessMembership?.role === 'OWNER' || selectedBusinessMembership?.role === 'ADMIN'
  const canApproveOrCancelRequisition =
    selectedBusinessMembership?.role === 'OWNER' || selectedBusinessMembership?.role === 'ADMIN'
  const canReceiveRequisition =
    selectedBusinessMembership?.role === 'OWNER' ||
    selectedBusinessMembership?.role === 'ADMIN' ||
    selectedBusinessMembership?.role === 'MANAGER'
  const canCreateRequisition = canReceiveRequisition
  const canRegisterExpense = canReceiveRequisition
  const canDeleteManualExpense =
    selectedBusinessMembership?.role === 'OWNER' || selectedBusinessMembership?.role === 'ADMIN'
  const canCreateEnvelope =
    selectedBusinessMembership?.role === 'OWNER' || selectedBusinessMembership?.role === 'ADMIN'
  const canDepositEnvelope = canReceiveRequisition
  const canPayEnvelope = canCreateEnvelope

  useEffect(() => {
    if (selectedBusiness?.locations?.length) {
      setSelectedLocationId(selectedBusiness.locations[0].id)
    } else {
      setSelectedLocationId('')
    }
  }, [selectedBusiness])

  useEffect(() => {
    if (activeItem !== 'Cierres de turno' || !selectedLocationId || !token) return

    const now = new Date()
    const fromDate = closingsRange === 'week' ? getStartOfWeek(now) : getStartOfMonth(now)

    setLoadingClosings(true)
    setClosingsError('')
    getShiftClosings({
      token,
      locationId: selectedLocationId,
      from: toDateInput(fromDate),
      to: toDateInput(now),
    })
      .then((response) => setClosings(response.items))
      .catch((error) => {
        setClosings([])
        setClosingsError(error instanceof Error ? error.message : 'No se pudieron cargar los cierres')
      })
      .finally(() => setLoadingClosings(false))
  }, [activeItem, closingsRange, selectedLocationId, token])

  useEffect(() => {
    if (activeItem !== 'Waitlist' || !token || !user?.isSuperAdmin) return
    setLoadingWaitlist(true)
    setWaitlistError('')
    getWaitlist({ token })
      .then((response) => setWaitlistLeads(response.items))
      .catch((error) => {
        setWaitlistLeads([])
        setWaitlistError(error instanceof Error ? error.message : 'No se pudo cargar la waitlist')
      })
      .finally(() => setLoadingWaitlist(false))
  }, [activeItem, token, user?.isSuperAdmin])

  useEffect(() => {
    if (!token || !selectedLocationId) return
    setLoadingDashboard(true)
    setDashboardError('')
    getDashboardSummary({
      token,
      locationId: selectedLocationId,
    })
      .then((response) => setDashboardSummary(response))
      .catch((error) => {
        setDashboardSummary(null)
        setDashboardError(error instanceof Error ? error.message : 'No se pudo cargar el dashboard')
      })
      .finally(() => setLoadingDashboard(false))
  }, [selectedLocationId, token])

  useEffect(() => {
    if (activeItem !== 'Gastos' || !token || !selectedBusinessId) return
    Promise.all([
      getExpenseCategories({ token, businessId: selectedBusinessId }),
      getBusinessCounterparties({ token, businessId: selectedBusinessId }),
    ])
      .then(([categoriesResponse, counterpartiesResponse]) => {
        const nextCategories = categoriesResponse.items || []
        setExpenseCategories(nextCategories)
        setCounterparties(counterpartiesResponse.counterparties || [])
        setExpenseDraft((prev) => ({
          ...prev,
          categoryId: prev.categoryId || nextCategories[0]?.id || '',
        }))
      })
      .catch((error) => {
        setExpenseCategories([])
        setExpensesError(error instanceof Error ? error.message : 'No se pudieron cargar categorías de gasto')
      })
  }, [activeItem, selectedBusinessId, token])

  useEffect(() => {
    if (activeItem !== 'Gastos' || !token || !selectedLocationId) return
    const { from, to } = getMonthBounds(gastosMonth)
    setLoadingExpenses(true)
    setExpensesError('')
    getLocationExpenses({
      token,
      locationId: selectedLocationId,
      from,
      to,
      categoryId: expensesCategoryFilter || undefined,
    })
      .then((response) => setExpenses(response.items || []))
      .catch((error) => {
        setExpenses([])
        setExpensesError(error instanceof Error ? error.message : 'No se pudieron cargar los gastos')
      })
      .finally(() => setLoadingExpenses(false))
  }, [activeItem, expensesCategoryFilter, gastosMonth, selectedLocationId, token])

  useEffect(() => {
    if (activeItem !== 'Proveedores y adeudos' || !token || !selectedBusinessId) return
    setLoadingPayables(true)
    setPayablesError('')
    Promise.all([
      getBusinessPayables({ token, businessId: selectedBusinessId }),
      getBusinessCounterparties({ token, businessId: selectedBusinessId }),
      getExpenseCategories({ token, businessId: selectedBusinessId }),
    ])
      .then(([payablesResponse, counterpartiesResponse, categoriesResponse]) => {
        setPayablesSummary(payablesResponse)
        const nextCounterparties = counterpartiesResponse.counterparties || []
        setCounterparties(nextCounterparties)
        const nextCategories = categoriesResponse.items || []
        setExpenseCategories(nextCategories)
        setPayableCreateDraft((prev) => ({
          ...prev,
          counterpartyId: prev.counterpartyId || nextCounterparties.find((item) => item.active)?.id || '',
          locationId: prev.locationId || selectedLocationId,
        }))
      })
      .catch((error) => {
        setPayablesSummary(null)
        setPayablesError(error instanceof Error ? error.message : 'No se pudieron cargar los adeudos')
      })
      .finally(() => setLoadingPayables(false))
  }, [activeItem, selectedBusinessId, selectedLocationId, token])

  useEffect(() => {
    if (activeItem !== 'P&L y reportes' || !token || !selectedLocationId) return
    setLoadingPnl(true)
    setPnlError('')
    getLocationPnl({
      token,
      locationId: selectedLocationId,
      month: pnlMonth,
    })
      .then((response) => setPnlSummary(response))
      .catch((error) => {
        setPnlSummary(null)
        setPnlError(error instanceof Error ? error.message : 'No se pudo cargar el P&L')
      })
      .finally(() => setLoadingPnl(false))
  }, [activeItem, pnlMonth, selectedLocationId, token])
  useEffect(() => {
    if (activeItem !== 'Sobres' || !token || !selectedBusinessId) return
    setLoadingEnvelopes(true)
    setEnvelopesError('')
    Promise.all([
      getBusinessEnvelopes({ token, businessId: selectedBusinessId }),
      getExpenseCategories({ token, businessId: selectedBusinessId }),
    ])
      .then(([summaryResponse, categoriesResponse]) => {
        setEnvelopesSummary(summaryResponse)
        const categories = categoriesResponse.items || []
        setExpenseCategories(categories)
        setEnvelopeDraft((prev) => ({
          ...prev,
          categoryId: prev.categoryId || categories[0]?.id || '',
        }))
      })
      .catch((error) => {
        setEnvelopesSummary(null)
        setEnvelopesError(error instanceof Error ? error.message : 'No se pudieron cargar los sobres')
      })
      .finally(() => setLoadingEnvelopes(false))
  }, [activeItem, selectedBusinessId, token])
  useEffect(() => {
    if (activeItem !== 'Equipo' || !token || !selectedBusinessId || !canManageTeam) return
    setLoadingTeam(true)
    setTeamError('')
    getBusinessMembers({
      token,
      businessId: selectedBusinessId,
    })
      .then((response) => setTeamMembers(response.items))
      .catch((error) => {
        setTeamMembers([])
        setTeamError(error instanceof Error ? error.message : 'No se pudo cargar el equipo')
      })
      .finally(() => setLoadingTeam(false))
  }, [activeItem, canManageTeam, selectedBusinessId, token])

  useEffect(() => {
    if (activeItem !== 'Requisiciones' || !token || !selectedBusinessId || !selectedLocationId) return
    setLoadingRequisitions(true)
    setRequisitionsError('')
    const loadCatalogAll = activeRequisitionsTab === 'CATALOG'

    const requisitionsPromise =
      requisitionsFilter === 'RECEIVED'
        ? getLocationRequisitions({
            token,
            locationId: selectedLocationId,
            status: 'RECEIVED',
          })
        : getLocationRequisitions({
            token,
            locationId: selectedLocationId,
          })

    Promise.all([
      requisitionsPromise,
      getBusinessItems({
        token,
        businessId: selectedBusinessId,
        all: loadCatalogAll && showInactiveItems,
      }),
      getBusinessCounterparties({
        token,
        businessId: selectedBusinessId,
        all: loadCatalogAll && showInactiveCounterparties,
      }),
    ])
      .then(([requisitionsResponse, itemsResponse, counterpartiesResponse]) => {
        const nextItems = itemsResponse.items || []
        setBusinessItems(nextItems)
        setCounterparties(counterpartiesResponse.counterparties || [])
        const sourceItems = requisitionsResponse.items || []
        const filteredItems =
          requisitionsFilter === 'ACTIVE'
            ? sourceItems.filter((item) => item.status === 'PENDING_APPROVAL' || item.status === 'APPROVED')
            : sourceItems
        setRequisitions(filteredItems)
      })
      .catch((error) => {
        setRequisitions([])
        setRequisitionsError(error instanceof Error ? error.message : 'No se pudieron cargar las requisiciones')
      })
      .finally(() => setLoadingRequisitions(false))
  }, [
    activeItem,
    activeRequisitionsTab,
    requisitionsFilter,
    selectedBusinessId,
    selectedLocationId,
    showInactiveCounterparties,
    showInactiveItems,
    token,
  ])

  useEffect(() => {
    const selectedItemIds = newRequisitionDraft.lines.map((line) => line.itemId).filter(Boolean)
    if (!selectedItemIds.length || selectedItemIds.length !== newRequisitionDraft.lines.length) {
      if (!newRequisitionDraft.counterpartyId) return
      setNewRequisitionDraft((prev) => ({ ...prev, counterpartyId: '' }))
      return
    }
    const defaults = selectedItemIds
      .map((itemId) => businessItems.find((item) => item.id === itemId)?.defaultCounterpartyId || null)
      .filter((value): value is string => Boolean(value))
    const uniqueDefaults = [...new Set(defaults)]
    const nextCounterpartyId =
      defaults.length === selectedItemIds.length && uniqueDefaults.length === 1 ? uniqueDefaults[0] : ''
    if (newRequisitionDraft.counterpartyId === nextCounterpartyId) return
    setNewRequisitionDraft((prev) => ({ ...prev, counterpartyId: nextCounterpartyId }))
  }, [businessItems, newRequisitionDraft.counterpartyId, newRequisitionDraft.lines])

  const selectedLocationName = useMemo(() => {
    return selectedBusiness?.locations.find((location) => location.id === selectedLocationId)?.name || ''
  }, [selectedBusiness, selectedLocationId])
  const activeBusinessItems = useMemo(
    () => businessItems.filter((item) => item.active),
    [businessItems],
  )
  const activeCounterparties = useMemo(
    () => counterparties.filter((counterparty) => counterparty.active),
    [counterparties],
  )
  const requisitionSearchResults = useMemo(() => {
    const query = requisitionSearch.trim().toLowerCase()
    const source = activeBusinessItems.filter((item) => !newRequisitionDraft.lines.some((line) => line.itemId === item.id))
    if (!query) return source.slice(0, 12)
    const startsWith = source.filter((item) => item.name.toLowerCase().startsWith(query))
    const includes = source.filter(
      (item) => !item.name.toLowerCase().startsWith(query) && item.name.toLowerCase().includes(query),
    )
    return [...startsWith, ...includes].slice(0, 12)
  }, [activeBusinessItems, newRequisitionDraft.lines, requisitionSearch])
  const requisitionCounterpartyById = useMemo(
    () =>
      activeCounterparties.reduce<Record<string, Counterparty>>((acc, counterparty) => {
        acc[counterparty.id] = counterparty
        return acc
      }, {}),
    [activeCounterparties],
  )
  const requisitionLinesWithItem = useMemo(
    () =>
      newRequisitionDraft.lines
        .map((line) => ({ line, item: activeBusinessItems.find((item) => item.id === line.itemId) || null }))
        .filter((entry): entry is { line: RequisitionLineDraft; item: BusinessItem } => Boolean(entry.item)),
    [activeBusinessItems, newRequisitionDraft.lines],
  )
  const requisitionCartGroups = useMemo(() => {
    const groups: Array<{
      providerKey: string
      providerName: string
      subtotal: number
      lines: Array<{ line: RequisitionLineDraft; item: BusinessItem }>
    }> = []
    const byProvider = new Map<
      string,
      {
        providerKey: string
        providerName: string
        subtotal: number
        lines: Array<{ line: RequisitionLineDraft; item: BusinessItem }>
      }
    >()
    requisitionLinesWithItem.forEach((entry) => {
      const providerId = entry.item.defaultCounterpartyId || ''
      const providerName = providerId
        ? requisitionCounterpartyById[providerId]?.name || 'Proveedor sin nombre'
        : 'Sin proveedor habitual'
      const providerKey = providerId || 'NO_DEFAULT'
      if (!byProvider.has(providerKey)) {
        byProvider.set(providerKey, { providerKey, providerName, subtotal: 0, lines: [] })
      }
      const group = byProvider.get(providerKey)!
      group.lines.push(entry)
      group.subtotal += entry.line.qty * entry.line.unitPrice
    })
    byProvider.forEach((group) => groups.push(group))
    return groups.sort((a, b) => a.providerName.localeCompare(b.providerName, 'es'))
  }, [requisitionCounterpartyById, requisitionLinesWithItem])
  const gastosMonthLabel = useMemo(() => formatMonthLabel(gastosMonth), [gastosMonth])
  const pnlMonthLabel = useMemo(() => formatMonthLabel(pnlMonth), [pnlMonth])
  const expensesMonthTotal = useMemo(
    () => expenses.reduce((sum, item) => sum + asDecimal(item.amount), 0),
    [expenses],
  )
  const payablesItems = useMemo(() => payablesSummary?.items || [], [payablesSummary])
  const payablesTotal = useMemo(() => asDecimal(payablesSummary?.totalPorPagar || 0), [payablesSummary])
  const payablesOverdue = useMemo(() => asDecimal(payablesSummary?.vencidos || 0), [payablesSummary])
  const activePayablesCounterparties = useMemo(
    () => counterparties.filter((counterparty) => counterparty.active),
    [counterparties],
  )
  const pnlOperativeBreakdown = useMemo(
    () => (pnlSummary?.desgloseCategorias || []).filter((item) => item.kind === 'OPERATIVO'),
    [pnlSummary],
  )
  const envelopeItems = useMemo(() => envelopesSummary?.items || [], [envelopesSummary])
  const envelopesDailyTarget = useMemo(
    () => Number((envelopesSummary?.totalDailyNeeded || 0).toFixed(2)),
    [envelopesSummary],
  )
  const envelopesAvailableCash = useMemo(
    () => Number((envelopesSummary?.availableCashToday || 0).toFixed(2)),
    [envelopesSummary],
  )
  const envelopesCashGap = useMemo(
    () => Number(Math.max(envelopesDailyTarget - envelopesAvailableCash, 0).toFixed(2)),
    [envelopesAvailableCash, envelopesDailyTarget],
  )
  const activeEnvelopeMovements = useMemo(
    () => (activeMovementsEnvelopeId ? envelopeMovementsByEnvelope[activeMovementsEnvelopeId] || [] : []),
    [activeMovementsEnvelopeId, envelopeMovementsByEnvelope],
  )
  const activeMovementEnvelopeName = useMemo(
    () => envelopeItems.find((item) => item.id === activeMovementsEnvelopeId)?.name || '',
    [activeMovementsEnvelopeId, envelopeItems],
  )
  const pnlIsEmpty = useMemo(() => {
    if (!pnlSummary) return true
    return (
      pnlSummary.ingresos === 0 &&
      pnlSummary.costoVenta === 0 &&
      pnlSummary.operativos === 0 &&
      pnlSummary.financieros === 0
    )
  }, [pnlSummary])
  const closeCashBreakdownTotal = useMemo(() => getCashBreakdownTotal(closeCashBreakdown), [closeCashBreakdown])

  const closingTotals = useMemo(() => getTotals(closeDraft), [closeDraft])
  const requisitionEstimatedTotal = useMemo(
    () => newRequisitionDraft.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0),
    [newRequisitionDraft.lines],
  )
  const receiveRealTotal = useMemo(
    () => receiveDraft.lines.reduce((sum, line) => sum + line.receivedQty * line.actualPrice, 0),
    [receiveDraft.lines],
  )
  const visibleNavGroups = useMemo(() => {
    const groups = [...navGroups]
    if (canManageTeam) groups.push(configGroup)
    if (user?.isSuperAdmin) groups.push(superAdminGroup)
    return groups
  }, [canManageTeam, user?.isSuperAdmin])

  useEffect(() => {
    if (!user?.isSuperAdmin && activeItem === 'Waitlist') {
      setActiveItem('Dashboard')
    }
  }, [activeItem, user?.isSuperAdmin])
  useEffect(() => {
    if (!canManageTeam && activeItem === 'Equipo') {
      setActiveItem('Dashboard')
    }
  }, [activeItem, canManageTeam])

  useEffect(() => {
    if (!isMobileMenuOpen) return
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [isMobileMenuOpen])

  useEffect(() => {
    if (!useCashBreakdownMode) return
    setCloseDraft((prev) => ({ ...prev, countedCash: closeCashBreakdownTotal }))
  }, [closeCashBreakdownTotal, useCashBreakdownMode])

  useEffect(() => {
    return () => {
      if (summaryPreview?.url) URL.revokeObjectURL(summaryPreview.url)
    }
  }, [summaryPreview])

  async function refreshShiftClosings() {
    if (!selectedLocationId || !token) return
    const now = new Date()
    const fromDate = closingsRange === 'week' ? getStartOfWeek(now) : getStartOfMonth(now)
    const response = await getShiftClosings({
      token,
      locationId: selectedLocationId,
      from: toDateInput(fromDate),
      to: toDateInput(now),
    })
    setClosings(response.items)
  }

  function resetPayableCreateDraft() {
    setPayableCreateDraft({
      counterpartyId: activePayablesCounterparties[0]?.id || '',
      kind: 'GOODS',
      reference: '',
      date: getTodayDateInput(),
      dueDate: getTodayDateInput(),
      total: 0,
      notes: '',
      locationId: selectedLocationId,
    })
  }

  function getPayablePaymentDraft(purchase: PayablesSummary['items'][number]['purchases'][number]): PayablePaymentDraft {
    const saldo = Math.max(asDecimal(purchase.total) - asDecimal(purchase.paidAmount), 0)
    return (
      payablePaymentDraftByPurchase[purchase.id] || {
        date: getTodayDateInput(),
        amount: saldo,
        method: 'TRANSFERENCIA',
        notes: '',
        locationId: selectedLocationId,
        categoryId: expenseCategories.find((category) => category.name === 'Otros gastos')?.id || expenseCategories[0]?.id || '',
      }
    )
  }

  async function handleCreatePayable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !selectedBusinessId) return
    if (!payableCreateDraft.counterpartyId || payableCreateDraft.total <= 0) {
      setPayablesError('Counterparty y monto son obligatorios')
      return
    }
    setSavingPayables(true)
    setPayablesError('')
    setPayablesSuccess('')
    try {
      await createBusinessPurchase({
        token,
        businessId: selectedBusinessId,
        payload: {
          counterpartyId: payableCreateDraft.counterpartyId,
          kind: payableCreateDraft.kind,
          reference: payableCreateDraft.reference.trim() || undefined,
          date: payableCreateDraft.date,
          dueDate: payableCreateDraft.dueDate || undefined,
          total: payableCreateDraft.total,
          notes: payableCreateDraft.notes.trim() || undefined,
          locationId: payableCreateDraft.locationId || undefined,
        },
      })
      await refreshPayablesData()
      setPayablesSuccess('Adeudo registrado ✓')
      setShowPayableForm(false)
      resetPayableCreateDraft()
    } catch (error) {
      setPayablesError(error instanceof Error ? error.message : 'No se pudo registrar el adeudo')
    } finally {
      setSavingPayables(false)
    }
  }

  async function handleCreateInlinePayableCounterparty() {
    if (!token || !selectedBusinessId) return
    if (!payableCounterpartyDraft.name.trim()) {
      setPayablesError('Nombre de acreedor es obligatorio')
      return
    }
    setSavingPayables(true)
    setPayablesError('')
    try {
      const response = await createBusinessCounterparty({
        token,
        businessId: selectedBusinessId,
        payload: {
          name: payableCounterpartyDraft.name.trim(),
          type: payableCounterpartyDraft.type,
          phone: payableCounterpartyDraft.phone.trim() || undefined,
        },
      })
      const counterpartiesResponse = await getBusinessCounterparties({
        token,
        businessId: selectedBusinessId,
      })
      setCounterparties(counterpartiesResponse.counterparties || [])
      setPayableCreateDraft((prev) => ({ ...prev, counterpartyId: response.counterparty.id }))
      setPayableCounterpartyDraft({ name: '', type: 'SUPPLIER', phone: '' })
      setShowInlinePayableCounterpartyForm(false)
      setPayablesSuccess('Acreedor creado ✓')
    } catch (error) {
      setPayablesError(error instanceof Error ? error.message : 'No se pudo crear el acreedor')
    } finally {
      setSavingPayables(false)
    }
  }

  async function loadPurchasePayments(purchaseId: string) {
    if (!token) return
    setLoadingPaymentsByPurchase((prev) => ({ ...prev, [purchaseId]: true }))
    try {
      const response = await getPurchasePayments({ token, purchaseId })
      setPurchasePaymentsByPurchase((prev) => ({ ...prev, [purchaseId]: response.items || [] }))
    } catch (error) {
      setPayablesError(error instanceof Error ? error.message : 'No se pudo cargar historial de pagos')
    } finally {
      setLoadingPaymentsByPurchase((prev) => ({ ...prev, [purchaseId]: false }))
    }
  }

  async function handlePayPurchase(purchase: PayablesSummary['items'][number]['purchases'][number]) {
    if (!token) return
    const draft = getPayablePaymentDraft(purchase)
    if (draft.amount <= 0) {
      setPayablesError('Captura un monto válido para abonar')
      return
    }
    if (purchase.kind === 'LOAN' && !draft.categoryId) {
      setPayablesError('Selecciona una categoría para el gasto del préstamo')
      return
    }

    setSavingPayables(true)
    setPayablesError('')
    setPayablesSuccess('')
    try {
      await createPurchasePayment({
        token,
        purchaseId: purchase.id,
        payload: {
          date: draft.date,
          amount: draft.amount,
          method: draft.method,
          notes: draft.notes.trim() || undefined,
          locationId: draft.locationId || undefined,
          categoryId: purchase.kind === 'LOAN' ? draft.categoryId || undefined : undefined,
        },
      })
      await refreshPayablesData()
      await loadPurchasePayments(purchase.id)
      setPayablesSuccess(
        purchase.kind === 'LOAN'
          ? 'Abono registrado y gasto creado ✓'
          : 'Pago registrado — adeudo actualizado ✓',
      )
      setActivePayPurchaseId('')
    } catch (error) {
      setPayablesError(error instanceof Error ? error.message : 'No se pudo registrar el pago')
    } finally {
      setSavingPayables(false)
    }
  }

  async function refreshRequisitionsData() {
    if (!token || !selectedBusinessId || !selectedLocationId) return
    const requisitionsResponse =
      requisitionsFilter === 'RECEIVED'
        ? await getLocationRequisitions({
            token,
            locationId: selectedLocationId,
            status: 'RECEIVED',
          })
        : await getLocationRequisitions({
            token,
            locationId: selectedLocationId,
          })
    const nextItems = requisitionsResponse.items || []
    const filteredItems =
      requisitionsFilter === 'ACTIVE'
        ? nextItems.filter((item) => item.status === 'PENDING_APPROVAL' || item.status === 'APPROVED')
        : nextItems
    setRequisitions(filteredItems)
  }

  async function refreshCatalogData() {
    if (!token || !selectedBusinessId) return
    const [itemsResponse, counterpartiesResponse] = await Promise.all([
      getBusinessItems({
        token,
        businessId: selectedBusinessId,
        all: showInactiveItems,
      }),
      getBusinessCounterparties({
        token,
        businessId: selectedBusinessId,
        all: showInactiveCounterparties,
      }),
    ])
    setBusinessItems(itemsResponse.items || [])
    setCounterparties(counterpartiesResponse.counterparties || [])
  }

  async function refreshExpensesData() {
    if (!token || !selectedLocationId) return
    const { from, to } = getMonthBounds(gastosMonth)
    const response = await getLocationExpenses({
      token,
      locationId: selectedLocationId,
      from,
      to,
      categoryId: expensesCategoryFilter || undefined,
    })
    setExpenses(response.items || [])
  }

  async function refreshPayablesData() {
    if (!token || !selectedBusinessId) return
    const response = await getBusinessPayables({ token, businessId: selectedBusinessId })
    setPayablesSummary(response)
    return response
  }

  async function refreshEnvelopesData() {
    if (!token || !selectedBusinessId) return
    const response = await getBusinessEnvelopes({ token, businessId: selectedBusinessId })
    setEnvelopesSummary(response)
    return response
  }

  function resetExpenseDraft() {
    setExpenseDraft({
      date: getTodayDateInput(),
      categoryId: expenseCategories[0]?.id || '',
      concept: '',
      amount: 0,
      method: 'EFECTIVO',
      counterpartyId: '',
      paidFromCash: false,
    })
  }

  async function handleCreateExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !selectedLocationId) return
    if (!expenseDraft.categoryId || !expenseDraft.concept.trim()) {
      setExpensesError('Categoría y concepto son obligatorios')
      return
    }
    setSavingExpense(true)
    setExpensesError('')
    setExpensesSuccess('')
    try {
      await createExpense({
        token,
        locationId: selectedLocationId,
        payload: {
          date: expenseDraft.date,
          categoryId: expenseDraft.categoryId,
          concept: expenseDraft.concept.trim(),
          amount: expenseDraft.amount,
          method: expenseDraft.method,
          counterpartyId: expenseDraft.counterpartyId || undefined,
          paidFromCash: expenseDraft.paidFromCash,
        },
      })
      await refreshExpensesData()
      setExpensesSuccess('Gasto registrado ✓')
      setShowExpenseForm(false)
      resetExpenseDraft()
    } catch (error) {
      setExpensesError(error instanceof Error ? error.message : 'No se pudo registrar el gasto')
    } finally {
      setSavingExpense(false)
    }
  }

  async function handleDeleteExpense(expense: ExpenseItem) {
    if (!token) return
    if (expense.source !== 'MANUAL') return
    if (!window.confirm(`¿Eliminar gasto "${expense.concept}"?`)) return
    setRowActionLoadingId(`expense-${expense.id}`)
    setExpensesError('')
    setExpensesSuccess('')
    try {
      await deleteExpense({ token, expenseId: expense.id })
      await refreshExpensesData()
      setExpensesSuccess('Gasto manual eliminado ✓')
    } catch (error) {
      setExpensesError(error instanceof Error ? error.message : 'No se pudo eliminar el gasto')
    } finally {
      setRowActionLoadingId('')
    }
  }

  function resetEnvelopeDraft() {
    setEnvelopeDraft({
      name: '',
      targetAmount: 0,
      frequency: 'MONTHLY',
      dueDay: 10,
      dueDate: getTodayDateInput(),
      categoryId: expenseCategories[0]?.id || '',
    })
  }

  async function handleCreateEnvelope(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !selectedBusinessId) return
    if (!envelopeDraft.name.trim() || envelopeDraft.targetAmount <= 0) {
      setEnvelopesError('Nombre y monto objetivo son obligatorios')
      return
    }
    setSavingEnvelope(true)
    setEnvelopesError('')
    setEnvelopesSuccess('')
    try {
      await createEnvelope({
        token,
        businessId: selectedBusinessId,
        payload: {
          name: envelopeDraft.name.trim(),
          targetAmount: envelopeDraft.targetAmount,
          frequency: envelopeDraft.frequency,
          ...(envelopeDraft.frequency === 'MONTHLY' ? { dueDay: envelopeDraft.dueDay } : {}),
          ...(envelopeDraft.frequency === 'ONE_TIME' ? { dueDate: envelopeDraft.dueDate } : {}),
          categoryId: envelopeDraft.categoryId || undefined,
        },
      })
      await refreshEnvelopesData()
      setEnvelopesSuccess('Sobre creado ✓')
      setShowEnvelopeForm(false)
      resetEnvelopeDraft()
    } catch (error) {
      setEnvelopesError(error instanceof Error ? error.message : 'No se pudo crear el sobre')
    } finally {
      setSavingEnvelope(false)
    }
  }

  async function handleDepositEnvelope(envelopeId: string) {
    if (!token) return
    const draft = depositDraftByEnvelope[envelopeId]
    if (!draft || draft.amount <= 0) {
      setEnvelopesError('Captura un monto válido para abonar')
      return
    }
    setSavingEnvelope(true)
    setEnvelopesError('')
    setEnvelopesSuccess('')
    try {
      await createEnvelopeDeposit({
        token,
        envelopeId,
        payload: {
          amount: draft.amount,
          note: draft.note.trim() || undefined,
        },
      })
      await refreshEnvelopesData()
      setEnvelopesSuccess('Abono registrado ✓')
      setDepositDraftByEnvelope((prev) => ({ ...prev, [envelopeId]: { amount: 0, note: '' } }))
      setActiveDepositEnvelopeId('')
    } catch (error) {
      setEnvelopesError(error instanceof Error ? error.message : 'No se pudo registrar el abono')
    } finally {
      setSavingEnvelope(false)
    }
  }

  async function handlePayEnvelope(envelope: EnvelopeItem) {
    if (!token || !selectedLocationId) return
    const draft = payDraftByEnvelope[envelope.id] || {
      locationId: selectedLocationId,
      date: getTodayDateInput(),
      amount: asDecimal(envelope.targetAmount),
      method: 'TRANSFERENCIA',
    }
    setSavingEnvelope(true)
    setEnvelopesError('')
    setEnvelopesSuccess('')
    try {
      await payEnvelope({
        token,
        envelopeId: envelope.id,
        payload: {
          locationId: draft.locationId,
          date: draft.date,
          amount: draft.amount,
          method: draft.method,
        },
      })
      await refreshEnvelopesData()
      setEnvelopesSuccess('Gasto registrado y sobre reiniciado ✓')
      setActivePayEnvelopeId('')
    } catch (error) {
      setEnvelopesError(error instanceof Error ? error.message : 'No se pudo pagar el sobre')
    } finally {
      setSavingEnvelope(false)
    }
  }

  async function handleWithdrawEnvelope(envelope: EnvelopeItem) {
    if (!token) return
    const draft = withdrawDraftByEnvelope[envelope.id]
    if (!draft || draft.amount <= 0 || !draft.reason.trim()) {
      setEnvelopesError('Monto y motivo son obligatorios para retirar')
      return
    }
    setSavingEnvelope(true)
    setEnvelopesError('')
    setEnvelopesSuccess('')
    try {
      await withdrawEnvelope({
        token,
        envelopeId: envelope.id,
        payload: {
          amount: draft.amount,
          reason: draft.reason.trim(),
        },
      })
      const summary = await refreshEnvelopesData()
      const updatedEnvelope = summary?.items.find((item) => item.id === envelope.id) || null
      setEnvelopesSuccess(
        `Retiro registrado ✓ Nuevo objetivo diario: ${formatMoney(updatedEnvelope?.dailyNeeded || 0)}/día`,
      )
      setWithdrawDraftByEnvelope((prev) => ({ ...prev, [envelope.id]: { amount: 0, reason: '' } }))
      setActiveWithdrawEnvelopeId('')
    } catch (error) {
      setEnvelopesError(error instanceof Error ? error.message : 'No se pudo registrar el retiro')
    } finally {
      setSavingEnvelope(false)
    }
  }

  async function handleTransferEnvelope(envelopeId: string) {
    if (!token) return
    const draft = transferDraftByEnvelope[envelopeId]
    if (!draft || draft.amount <= 0 || !draft.toEnvelopeId) {
      setEnvelopesError('Selecciona destino y captura un monto válido para transferir')
      return
    }
    if (draft.toEnvelopeId === envelopeId) {
      setEnvelopesError('El sobre destino debe ser distinto al origen')
      return
    }
    setSavingEnvelope(true)
    setEnvelopesError('')
    setEnvelopesSuccess('')
    try {
      await transferEnvelope({
        token,
        envelopeId,
        payload: {
          toEnvelopeId: draft.toEnvelopeId,
          amount: draft.amount,
          note: draft.note.trim() || undefined,
        },
      })
      await refreshEnvelopesData()
      setEnvelopesSuccess('Transferencia registrada ✓')
      setTransferDraftByEnvelope((prev) => ({
        ...prev,
        [envelopeId]: { toEnvelopeId: '', amount: 0, note: '' },
      }))
      setActiveTransferEnvelopeId('')
    } catch (error) {
      setEnvelopesError(error instanceof Error ? error.message : 'No se pudo registrar la transferencia')
    } finally {
      setSavingEnvelope(false)
    }
  }

  async function handleOpenEnvelopeMovements(envelopeId: string) {
    if (!token) return
    setActiveMovementsEnvelopeId(envelopeId)
    setLoadingEnvelopeMovements(true)
    setEnvelopesError('')
    try {
      const response = await getEnvelopeMovements({ token, envelopeId })
      setEnvelopeMovementsByEnvelope((prev) => ({ ...prev, [envelopeId]: response.items || [] }))
    } catch (error) {
      setActiveMovementsEnvelopeId('')
      setEnvelopesError(error instanceof Error ? error.message : 'No se pudo cargar el historial del sobre')
    } finally {
      setLoadingEnvelopeMovements(false)
    }
  }

  async function handleDeleteEnvelope(envelopeId: string, name: string) {
    if (!token) return
    if (!window.confirm(`¿Eliminar sobre "${name}"?`)) return
    setSavingEnvelope(true)
    setEnvelopesError('')
    setEnvelopesSuccess('')
    try {
      await deleteEnvelope({ token, envelopeId })
      await refreshEnvelopesData()
      setEnvelopesSuccess('Sobre eliminado/desactivado ✓')
    } catch (error) {
      setEnvelopesError(error instanceof Error ? error.message : 'No se pudo eliminar el sobre')
    } finally {
      setSavingEnvelope(false)
    }
  }

  function resetNewRequisitionDraft() {
    setNewRequisitionDraft({
      counterpartyId: '',
      notes: '',
      expectedDate: getMexicoTomorrowDateInput(),
      lines: [],
    })
    setRequisitionSearch('')
    setRequisitionSearchQty(1)
    setRequisitionFormError('')
  }

  function removeRequisitionLine(index: number) {
    setNewRequisitionDraft((prev) => {
      return { ...prev, lines: prev.lines.filter((_, lineIndex) => lineIndex !== index) }
    })
  }

  function updateRequisitionLine(index: number, next: Partial<RequisitionLineDraft>) {
    setNewRequisitionDraft((prev) => {
      const lines = [...prev.lines]
      const current = lines[index]
      if (!current) return prev
      lines[index] = { ...current, ...next }
      return { ...prev, lines }
    })
  }

  function addRequisitionItemToCart(itemId: string) {
    const item = activeBusinessItems.find((entry) => entry.id === itemId)
    if (!item) return
    const nextQty = Math.max(asNumber(String(requisitionSearchQty)), 0.001)
    setNewRequisitionDraft((prev) => {
      const existingIndex = prev.lines.findIndex((line) => line.itemId === itemId)
      if (existingIndex >= 0) {
        const lines = [...prev.lines]
        lines[existingIndex] = {
          ...lines[existingIndex],
          qty: Number((lines[existingIndex].qty + nextQty).toFixed(3)),
        }
        return { ...prev, lines }
      }
      return {
        ...prev,
        lines: [
          ...prev.lines,
          {
            itemId,
            qty: nextQty,
            unitPrice: asDecimal(item.lastPrice),
          },
        ],
      }
    })
    setRequisitionSearch('')
    setRequisitionSearchQty(1)
  }

  function buildTicketSummaryFromRequisitions({
    sourceRequisitions,
    dateKey,
  }: {
    sourceRequisitions: RequisitionItem[]
    dateKey: string
  }): RequisitionTicketSummary | null {
    const groupsByProvider = new Map<string, RequisitionTicketGroup>()
    sourceRequisitions.forEach((requisition) => {
      const providerName = requisition.counterparty?.name || 'Sin proveedor'
      if (!groupsByProvider.has(providerName)) {
        groupsByProvider.set(providerName, { providerName, lines: [], subtotal: 0 })
      }
      const group = groupsByProvider.get(providerName)!
      requisition.lines.forEach((line) => {
        const fallbackItem = activeBusinessItems.find((item) => item.id === line.itemId)
        const itemName = line.item?.name || fallbackItem?.name || 'Insumo'
        const itemUnit = line.item?.unit || fallbackItem?.unit || 'PZA'
        const qty = asDecimal(line.qty)
        const subtotal = Number((qty * asDecimal(line.unitPrice)).toFixed(2))
        group.lines.push({ qty, unit: itemUnit, name: itemName, subtotal })
        group.subtotal = Number((group.subtotal + subtotal).toFixed(2))
      })
    })
    const groups = Array.from(groupsByProvider.values()).sort((a, b) =>
      a.providerName.localeCompare(b.providerName, 'es'),
    )
    if (!groups.length) return null
    const total = Number(groups.reduce((sum, group) => sum + group.subtotal, 0).toFixed(2))
    const [year, month, day] = dateKey.split('-')
    return {
      businessName: selectedBusiness?.name || 'Negocio',
      dateLabel: `${day || '00'}/${month || '00'}/${year || '0000'}`,
      dateKey,
      groups,
      total,
    }
  }

  async function openRequisitionSummaryPreview(summary: RequisitionTicketSummary) {
    const canvas = drawRequisitionTicket(summary)
    if (!canvas) {
      setRequisitionsError('No se pudo generar la imagen del resumen')
      return
    }
    const blob = await canvasToBlob(canvas)
    if (!blob) {
      setRequisitionsError('No se pudo exportar la imagen del resumen')
      return
    }
    const filename = `pedido-${summary.dateKey}.png`
    const file = new File([blob], filename, { type: 'image/png' })
    const url = URL.createObjectURL(blob)
    if (summaryPreview?.url) URL.revokeObjectURL(summaryPreview.url)
    setSummaryPreview({ url, file, filename })
  }

  function downloadSummaryImage() {
    if (!summaryPreview) return
    const link = document.createElement('a')
    link.href = summaryPreview.url
    link.download = summaryPreview.filename
    link.click()
  }

  async function shareSummaryImage() {
    if (!summaryPreview) return
    const canShare = typeof navigator.share === 'function'
    const canShareFiles =
      canShare &&
      ((navigator as Navigator & { canShare?: (payload: ShareData) => boolean }).canShare?.({
        files: [summaryPreview.file],
      }) ??
        false)
    if (canShareFiles) {
      await navigator.share({
        files: [summaryPreview.file],
        title: summaryPreview.filename,
      })
      return
    }
    downloadSummaryImage()
  }

  async function handleOpenCreatedRequisitionsSummary() {
    if (!lastCreatedRequisitionItems.length) {
      setRequisitionsError('No hay requisiciones recién creadas para resumir')
      return
    }
    setCreatingSummaryImage(true)
    try {
      const summary = buildTicketSummaryFromRequisitions({
        sourceRequisitions: lastCreatedRequisitionItems,
        dateKey: getTodayDateInput(),
      })
      if (!summary) {
        setRequisitionsError('No se encontró información para generar el resumen')
        return
      }
      await openRequisitionSummaryPreview(summary)
    } finally {
      setCreatingSummaryImage(false)
    }
  }

  async function handleOpenTodayRequisitionsSummary() {
    if (!token || !selectedLocationId) return
    setCreatingSummaryImage(true)
    setRequisitionsError('')
    try {
      const response = await getLocationRequisitions({
        token,
        locationId: selectedLocationId,
      })
      const todayKey = getTodayDateInput()
      const todayRequisitions = (response.items || []).filter(
        (item) => item.status !== 'CANCELLED' && item.createdAt?.slice(0, 10) === todayKey,
      )
      if (!todayRequisitions.length) {
        setRequisitionsError('No hay requisiciones del día para compartir')
        return
      }
      const summary = buildTicketSummaryFromRequisitions({
        sourceRequisitions: todayRequisitions,
        dateKey: todayKey,
      })
      if (!summary) {
        setRequisitionsError('No se pudo construir el resumen del día')
        return
      }
      await openRequisitionSummaryPreview(summary)
    } finally {
      setCreatingSummaryImage(false)
    }
  }

  function openReceiveModal(requisition: RequisitionItem) {
    setReceiveTarget(requisition)
    setReceiveError('')
    setReceiveDraft({
      counterpartyId: requisition.counterpartyId || '',
      receivedDate: getMexicoTodayDateInput(),
      lines: requisition.lines.map((line) => ({
        lineId: line.id,
        itemName: line.item.name,
        qty: asDecimal(line.qty),
        unitPrice: asDecimal(line.unitPrice),
        receivedQty: asDecimal(line.qty),
        actualPrice: asDecimal(line.unitPrice),
      })),
    })
    setShowReceiveModal(true)
  }

  function closeReceiveModal() {
    setShowReceiveModal(false)
    setReceiveTarget(null)
    setReceiveError('')
    setReceiveDraft({ counterpartyId: '', receivedDate: getMexicoTodayDateInput(), lines: [] })
  }

  function handleSelectNavItem(item: string) {
    setActiveItem(item)
    setIsMobileMenuOpen(false)
  }

  const renderSidebarContent = () => (
    <>
      <div className="q-sidebar-logo">
        <img src="/logo.png" alt="Quadre" />
      </div>

      <div className="q-selector-block">
        <label>
          Negocio
          <select value={selectedBusinessId} onChange={(event) => setSelectedBusinessId(event.target.value)}>
            {memberships.map((membership) => (
              <option key={membership.business.id} value={membership.business.id}>
                {membership.business.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Sucursal
          <select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)}>
            {(selectedBusiness?.locations || []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visibleNavGroups.map((group) => (
        <section className="q-nav-group" key={group.title}>
          <h4>{group.title}</h4>
          <ul className="q-nav-list">
            {group.items.map((item) => (
              <li key={item}>
                <button
                  className={`q-nav-item ${activeItem === item ? 'active' : ''}`}
                  type="button"
                  onClick={() => handleSelectNavItem(item)}
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )

  function updateShiftLine(index: number, next: Partial<ShiftLineDraft>) {
    setCloseDraft((prev) => {
      const lines = [...prev.lines]
      const current = lines[index]
      if (!current) return prev
      lines[index] = { ...current, ...next }
      return { ...prev, lines }
    })
  }

  function addShiftLine() {
    setCloseDraft((prev) => ({ ...prev, lines: [...prev.lines, { ...defaultShiftLine }] }))
  }

  function removeShiftLine(index: number) {
    setCloseDraft((prev) => {
      if (prev.lines.length <= 1) return prev
      return { ...prev, lines: prev.lines.filter((_, lineIndex) => lineIndex !== index) }
    })
  }

  function toggleCashBreakdownMode() {
    setUseCashBreakdownMode((prev) => {
      const next = !prev
      if (next) {
        setCloseDraft((draft) => ({ ...draft, countedCash: closeCashBreakdownTotal }))
      }
      return next
    })
  }

  function setCashBreakdownQuantity(denominationKey: string, quantity: number) {
    setCloseCashBreakdown((prev) => ({
      ...prev,
      [denominationKey]: Math.max(Math.floor(quantity), 0),
    }))
  }

  async function refreshTeamMembers() {
    if (!token || !selectedBusinessId) return
    const response = await getBusinessMembers({
      token,
      businessId: selectedBusinessId,
    })
    setTeamMembers(response.items)
  }
  function resetCloseForm() {
    setCloseDraft({
      date: getTodayDateInput(),
      type: 'UNICO',
      openingCash: 1500,
      cashWithdrawn: 0,
      countedCash: 0,
      notes: '',
      lines: [{ ...defaultShiftLine }],
    })
    setUseCashBreakdownMode(false)
    setCloseCashBreakdown({})
    setCloseError('')
  }

  function resetMemberForm() {
    setMemberForm({
      name: '',
      email: '',
      password: '',
      role: 'MANAGER',
      locationId: 'ALL',
    })
    setAddMemberError('')
  }
  async function handleCreateClosing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedLocationId || !token) return

    setSavingClose(true)
    setCloseError('')
    try {
      await createShiftClosing({
        token,
        locationId: selectedLocationId,
        payload: {
          date: closeDraft.date,
          type: closeDraft.type,
          openingCash: closeDraft.openingCash,
          cashWithdrawn: closeDraft.cashWithdrawn,
          countedCash: closeDraft.countedCash,
          ...(useCashBreakdownMode
            ? { cashBreakdown: sanitizeCashBreakdownForPayload(closeCashBreakdown) }
            : {}),
          notes: closeDraft.notes || undefined,
          lines: closeDraft.lines.map((line) => ({
            channel: line.channel,
            method: line.method,
            gross: line.gross,
            feePct: line.feePct,
          })),
        },
      })
      await refreshShiftClosings()
      resetCloseForm()
      setShowCloseForm(false)
      setActiveItem('Cierres de turno')
    } catch (error) {
      setCloseError(error instanceof Error ? error.message : 'No se pudo cerrar el turno')
    } finally {
      setSavingClose(false)
    }
  }

  async function handleCreateQuickItem() {
    if (!token || !selectedBusinessId) return
    setSavingQuickItem(true)
    setQuickItemError('')
    try {
      const response = await createBusinessItem({
        token,
        businessId: selectedBusinessId,
        payload: {
          name: quickItemDraft.name.trim(),
          unit: quickItemDraft.unit,
          lastPrice: quickItemDraft.lastPrice,
        },
      })
      const updatedItems = [...businessItems, response.item].sort((a, b) => a.name.localeCompare(b.name))
      setBusinessItems(updatedItems)
      setQuickItemDraft({ name: '', unit: 'PZA', lastPrice: 0 })
      setNewRequisitionDraft((prev) => {
        const lines = [...prev.lines]
        if (!lines[0]?.itemId) {
          lines[0] = {
            ...lines[0],
            itemId: response.item.id,
            unitPrice: asDecimal(response.item.lastPrice),
          }
        }
        return { ...prev, lines }
      })
    } catch (error) {
      setQuickItemError(error instanceof Error ? error.message : 'No se pudo crear el insumo')
    } finally {
      setSavingQuickItem(false)
    }
  }

  async function handleSaveCatalogItem(isEditing: boolean) {
    if (!token || !selectedBusinessId) return
    if (!catalogItemDraft.name.trim()) {
      setRequisitionsError('El nombre del insumo es obligatorio')
      return
    }
    setSavingCatalog(true)
    setRequisitionsError('')
    try {
      if (isEditing && editingItemId) {
        await patchBusinessItem({
          token,
          businessId: selectedBusinessId,
          itemId: editingItemId,
          payload: {
            name: catalogItemDraft.name.trim(),
            unit: catalogItemDraft.unit,
            category: catalogItemDraft.category.trim() || null,
            lastPrice: catalogItemDraft.lastPrice,
            defaultCounterpartyId: catalogItemDraft.defaultCounterpartyId || null,
          },
        })
      } else {
        await createBusinessItem({
          token,
          businessId: selectedBusinessId,
          payload: {
            name: catalogItemDraft.name.trim(),
            unit: catalogItemDraft.unit,
            category: catalogItemDraft.category.trim() || undefined,
            lastPrice: catalogItemDraft.lastPrice,
            defaultCounterpartyId: catalogItemDraft.defaultCounterpartyId || undefined,
          },
        })
      }
      await refreshCatalogData()
      setCatalogItemDraft({
        name: '',
        unit: 'PZA',
        category: '',
        lastPrice: 0,
        defaultCounterpartyId: '',
      })
      setEditingItemId('')
      setRequisitionsSuccess(isEditing ? 'Insumo actualizado ✓' : 'Insumo creado ✓')
    } catch (error) {
      setRequisitionsError(error instanceof Error ? error.message : 'No se pudo guardar el insumo')
    } finally {
      setSavingCatalog(false)
    }
  }

  async function handleSaveCounterparty(isEditing: boolean) {
    if (!token || !selectedBusinessId) return
    if (!catalogCounterpartyDraft.name.trim()) {
      setRequisitionsError('El nombre del proveedor es obligatorio')
      return
    }
    if (!isEditing && !catalogCounterpartyDraft.phone.trim()) {
      setRequisitionsError('El teléfono del proveedor es obligatorio')
      return
    }
    setSavingCatalog(true)
    setRequisitionsError('')
    try {
      if (isEditing && editingCounterpartyId) {
        await patchBusinessCounterparty({
          token,
          businessId: selectedBusinessId,
          counterpartyId: editingCounterpartyId,
          payload: {
            name: catalogCounterpartyDraft.name.trim(),
            phone: catalogCounterpartyDraft.phone.trim() || null,
            paymentTerms: catalogCounterpartyDraft.paymentTerms.trim() || null,
            notes: catalogCounterpartyDraft.notes.trim() || null,
          },
        })
      } else {
        await createBusinessCounterparty({
          token,
          businessId: selectedBusinessId,
          payload: {
            name: catalogCounterpartyDraft.name.trim(),
            phone: catalogCounterpartyDraft.phone.trim() || undefined,
            paymentTerms: catalogCounterpartyDraft.paymentTerms.trim() || undefined,
            notes: catalogCounterpartyDraft.notes.trim() || undefined,
          },
        })
      }
      await refreshCatalogData()
      setCatalogCounterpartyDraft({
        name: '',
        phone: '',
        paymentTerms: '',
        notes: '',
      })
      setEditingCounterpartyId('')
      setRequisitionsSuccess(isEditing ? 'Proveedor actualizado ✓' : 'Proveedor creado ✓')
    } catch (error) {
      setRequisitionsError(error instanceof Error ? error.message : 'No se pudo guardar el proveedor')
    } finally {
      setSavingCatalog(false)
    }
  }

  async function handleDeleteCatalogItem(item: BusinessItem) {
    if (!token || !selectedBusinessId) return
    if (!window.confirm(`¿Eliminar ${item.name}?`)) return
    setRowActionLoadingId(`item-delete-${item.id}`)
    setRequisitionsError('')
    setRequisitionsSuccess('')
    try {
      const response = await deleteBusinessItem({
        token,
        businessId: selectedBusinessId,
        itemId: item.id,
      })
      await refreshCatalogData()
      setRequisitionsSuccess(
        response.deactivated
          ? 'Se desactivó porque tiene historial — ya no aparecerá en nuevas requisiciones'
          : 'Insumo eliminado ✓',
      )
      if (editingItemId === item.id) {
        setEditingItemId('')
        setCatalogItemDraft({
          name: '',
          unit: 'PZA',
          category: '',
          lastPrice: 0,
          defaultCounterpartyId: '',
        })
      }
    } catch (error) {
      setRequisitionsError(error instanceof Error ? error.message : 'No se pudo eliminar el insumo')
    } finally {
      setRowActionLoadingId('')
    }
  }

  async function handleReactivateCatalogItem(itemId: string) {
    if (!token || !selectedBusinessId) return
    setRowActionLoadingId(`item-reactivate-${itemId}`)
    setRequisitionsError('')
    setRequisitionsSuccess('')
    try {
      await patchBusinessItem({
        token,
        businessId: selectedBusinessId,
        itemId,
        payload: { active: true },
      })
      await refreshCatalogData()
      setRequisitionsSuccess('Insumo reactivado ✓')
    } catch (error) {
      setRequisitionsError(error instanceof Error ? error.message : 'No se pudo reactivar el insumo')
    } finally {
      setRowActionLoadingId('')
    }
  }

  async function handleDeleteCatalogCounterparty(counterparty: Counterparty) {
    if (!token || !selectedBusinessId) return
    if (!window.confirm(`¿Eliminar ${counterparty.name}?`)) return
    setRowActionLoadingId(`counterparty-delete-${counterparty.id}`)
    setRequisitionsError('')
    setRequisitionsSuccess('')
    try {
      const response = await deleteBusinessCounterparty({
        token,
        businessId: selectedBusinessId,
        counterpartyId: counterparty.id,
      })
      await refreshCatalogData()
      setRequisitionsSuccess(
        response.deactivated
          ? 'Se desactivó porque tiene historial — ya no aparecerá en nuevas requisiciones'
          : 'Proveedor eliminado ✓',
      )
      if (editingCounterpartyId === counterparty.id) {
        setEditingCounterpartyId('')
        setCatalogCounterpartyDraft({
          name: '',
          phone: '',
          paymentTerms: '',
          notes: '',
        })
      }
    } catch (error) {
      setRequisitionsError(error instanceof Error ? error.message : 'No se pudo eliminar el proveedor')
    } finally {
      setRowActionLoadingId('')
    }
  }

  async function handleReactivateCatalogCounterparty(counterpartyId: string) {
    if (!token || !selectedBusinessId) return
    setRowActionLoadingId(`counterparty-reactivate-${counterpartyId}`)
    setRequisitionsError('')
    setRequisitionsSuccess('')
    try {
      await patchBusinessCounterparty({
        token,
        businessId: selectedBusinessId,
        counterpartyId,
        payload: { active: true },
      })
      await refreshCatalogData()
      setRequisitionsSuccess('Proveedor reactivado ✓')
    } catch (error) {
      setRequisitionsError(error instanceof Error ? error.message : 'No se pudo reactivar el proveedor')
    } finally {
      setRowActionLoadingId('')
    }
  }

  async function handleSendOrderWhatsApp(requisition: RequisitionItem) {
    if (!selectedBusiness) return
    const counterparty = requisition.counterparty
    if (!counterparty) return
    if (!counterparty.phone) {
      setPhoneCaptureCounterpartyId(counterparty.id)
      setPhoneCaptureValue('')
      return
    }
    const url = buildOrderWhatsappUrl({
      phone: counterparty.phone,
      businessName: selectedBusiness.name,
      requisition,
    })
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleSavePhoneAndSendOrder(requisition: RequisitionItem) {
    if (!token || !selectedBusinessId || !phoneCaptureCounterpartyId || !selectedBusiness) return
    setSavingCatalog(true)
    setRequisitionsError('')
    try {
      const response = await patchBusinessCounterparty({
        token,
        businessId: selectedBusinessId,
        counterpartyId: phoneCaptureCounterpartyId,
        payload: {
          phone: phoneCaptureValue.trim(),
        },
      })
      await refreshCatalogData()
      const url = buildOrderWhatsappUrl({
        phone: response.counterparty.phone || phoneCaptureValue,
        businessName: selectedBusiness.name,
        requisition,
      })
      setPhoneCaptureCounterpartyId('')
      setPhoneCaptureValue('')
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      setRequisitionsError(error instanceof Error ? error.message : 'No se pudo guardar el teléfono')
    } finally {
      setSavingCatalog(false)
    }
  }

  async function handleCreateRequisition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !selectedLocationId) return
    if (!newRequisitionDraft.lines.length) {
      setRequisitionFormError('Agrega al menos un producto al carrito')
      return
    }
    if (!newRequisitionDraft.lines.every((line) => line.itemId)) {
      setRequisitionFormError('Selecciona un insumo en cada línea')
      return
    }

    setSavingRequisition(true)
    setRequisitionFormError('')
    setRequisitionsSuccess('')
    try {
      const response = await createRequisitionBatch({
        token,
        locationId: selectedLocationId,
        payload: {
          notes: newRequisitionDraft.notes.trim() || undefined,
          expectedDate: newRequisitionDraft.expectedDate || undefined,
          lines: newRequisitionDraft.lines.map((line) => ({
            itemId: line.itemId,
            qty: line.qty,
            unitPrice: line.unitPrice,
          })),
        },
      })
      await refreshRequisitionsData()
      setShowRequisitionForm(false)
      resetNewRequisitionDraft()
      const createdCount = response.requisitions?.length || 0
      setLastCreatedRequisitionItems(response.requisitions || [])
      setRequisitionsSuccess(
        createdCount > 1
          ? `${createdCount} requisiciones creadas y separadas por proveedor ✓`
          : 'Requisición creada correctamente ✓',
      )
    } catch (error) {
      setRequisitionFormError(error instanceof Error ? error.message : 'No se pudo crear la requisición')
    } finally {
      setSavingRequisition(false)
    }
  }

  function canAssignPendingRequisitionProvider(requisition: RequisitionItem) {
    return (
      !requisition.counterpartyId &&
      (requisition.status === 'PENDING_APPROVAL' || requisition.status === 'APPROVED')
    )
  }

  function getAssignRequisitionDraft(requisition: RequisitionItem): RequisitionAssignDraft {
    return (
      assignDraftByRequisitionId[requisition.id] || {
        counterpartyId: '',
        showInlineCreate: false,
      }
    )
  }

  function toggleRequisitionDetail(requisition: RequisitionItem) {
    setExpandedRequisitionId((prev) => (prev === requisition.id ? '' : requisition.id))
    if (!canAssignPendingRequisitionProvider(requisition)) return
    setAssignDraftByRequisitionId((prev) =>
      prev[requisition.id]
        ? prev
        : {
            ...prev,
            [requisition.id]: { counterpartyId: '', showInlineCreate: false },
          },
    )
  }

  async function handleAssignCounterpartyToRequisition(requisition: RequisitionItem) {
    if (!token) return
    const draft = getAssignRequisitionDraft(requisition)
    if (!draft.counterpartyId) {
      setRequisitionsError('Selecciona un proveedor para asignar')
      return
    }
    setRowActionLoadingId(`assign-${requisition.id}`)
    setRequisitionsError('')
    setRequisitionsSuccess('')
    try {
      await patchRequisition({
        token,
        requisitionId: requisition.id,
        payload: { counterpartyId: draft.counterpartyId },
      })
      await refreshRequisitionsData()
      setAssignDraftByRequisitionId((prev) => {
        const next = { ...prev }
        delete next[requisition.id]
        return next
      })
      setRequisitionsSuccess('Proveedor asignado ✓')
    } catch (error) {
      setRequisitionsError(error instanceof Error ? error.message : 'No se pudo asignar el proveedor')
    } finally {
      setRowActionLoadingId('')
    }
  }

  async function handleCreateInlineRequisitionCounterparty(requisition: RequisitionItem) {
    if (!token || !selectedBusinessId) return
    if (!requisitionCounterpartyDraft.name.trim()) {
      setRequisitionsError('Nombre de proveedor es obligatorio')
      return
    }
    setRowActionLoadingId(`assign-create-${requisition.id}`)
    setRequisitionsError('')
    setRequisitionsSuccess('')
    try {
      const createResponse = await createBusinessCounterparty({
        token,
        businessId: selectedBusinessId,
        payload: {
          name: requisitionCounterpartyDraft.name.trim(),
          type: requisitionCounterpartyDraft.type,
          phone: requisitionCounterpartyDraft.phone.trim() || undefined,
        },
      })
      const counterpartiesResponse = await getBusinessCounterparties({
        token,
        businessId: selectedBusinessId,
      })
      setCounterparties(counterpartiesResponse.counterparties || [])
      setAssignDraftByRequisitionId((prev) => ({
        ...prev,
        [requisition.id]: {
          counterpartyId: createResponse.counterparty.id,
          showInlineCreate: false,
        },
      }))
      setRequisitionCounterpartyDraft({ name: '', type: 'SUPPLIER', phone: '' })
      setRequisitionsSuccess('Proveedor creado ✓')
    } catch (error) {
      setRequisitionsError(error instanceof Error ? error.message : 'No se pudo crear el proveedor')
    } finally {
      setRowActionLoadingId('')
    }
  }

  async function handleApproveRequisition(requisitionId: string) {
    if (!token) return
    setRowActionLoadingId(requisitionId)
    setRequisitionsError('')
    setRequisitionsSuccess('')
    try {
      await approveRequisition({ token, requisitionId })
      await refreshRequisitionsData()
      setRequisitionsSuccess('Requisición aprobada ✓')
    } catch (error) {
      setRequisitionsError(error instanceof Error ? error.message : 'No se pudo aprobar la requisición')
    } finally {
      setRowActionLoadingId('')
    }
  }

  async function handleCancelRequisition(requisitionId: string) {
    if (!token) return
    setRowActionLoadingId(requisitionId)
    setRequisitionsError('')
    setRequisitionsSuccess('')
    try {
      await cancelRequisition({ token, requisitionId })
      await refreshRequisitionsData()
      setRequisitionsSuccess('Requisición cancelada ✓')
    } catch (error) {
      setRequisitionsError(error instanceof Error ? error.message : 'No se pudo cancelar la requisición')
    } finally {
      setRowActionLoadingId('')
    }
  }

  async function handleReceiveRequisition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !receiveTarget) return
    if (!receiveTarget.counterpartyId && !receiveDraft.counterpartyId) {
      setReceiveError('Selecciona un proveedor para continuar')
      return
    }

    setSavingReceive(true)
    setReceiveError('')
    try {
      await receiveRequisition({
        token,
        requisitionId: receiveTarget.id,
        payload: {
          counterpartyId: receiveTarget.counterpartyId ? undefined : receiveDraft.counterpartyId,
          receivedDate: receiveDraft.receivedDate || undefined,
          lines: receiveDraft.lines.map((line) => ({
            lineId: line.lineId,
            receivedQty: line.receivedQty,
            actualPrice: line.actualPrice,
          })),
        },
      })
      const counterpartyName =
        receiveTarget.counterparty?.name ||
        counterparties.find((counterparty) => counterparty.id === receiveDraft.counterpartyId)?.name ||
        'proveedor'
      closeReceiveModal()
      await refreshRequisitionsData()
      setRequisitionsSuccess(`Adeudo con ${counterpartyName} y gasto registrados ✓`)
    } catch (error) {
      setReceiveError(error instanceof Error ? error.message : 'No se pudo recibir la requisición')
    } finally {
      setSavingReceive(false)
    }
  }

  const renderShiftClosings = () => (
    <section className="q-shift-closings">
      <header className="q-section-header">
        <div>
          <h1>Cierres de turno</h1>
          <p>Control de arqueo por turno para la sucursal seleccionada.</p>
        </div>
        <div className="q-actions-row">
          <div className="q-filter-row">
            <button
              type="button"
              className={`q-chip-btn ${closingsRange === 'week' ? 'active' : ''}`}
              onClick={() => setClosingsRange('week')}
            >
              Esta semana
            </button>
            <button
              type="button"
              className={`q-chip-btn ${closingsRange === 'month' ? 'active' : ''}`}
              onClick={() => setClosingsRange('month')}
            >
              Este mes
            </button>
          </div>
          <button
            className="q-btn q-btn-inline"
            type="button"
            onClick={() => {
              resetCloseForm()
              setShowCloseForm(true)
            }}
          >
            Cerrar turno
          </button>
        </div>
      </header>

      {showCloseForm ? (
        <section className="q-close-form-wrap">
          <header className="q-close-form-header">
            <h2>Cerrar turno</h2>
            <button type="button" className="q-link-btn" onClick={() => setShowCloseForm(false)}>
              Volver a la lista
            </button>
          </header>
          <form className="q-close-form-grid" onSubmit={handleCreateClosing}>
            <section className="q-card q-close-form-main">
              <div className="q-field-grid-2">
                <label className="q-field">
                  Fecha
                  <input
                    type="date"
                    required
                    value={closeDraft.date}
                    onChange={(event) =>
                      setCloseDraft((prev) => ({ ...prev, date: event.target.value }))
                    }
                  />
                </label>

                <label className="q-field">
                  Tipo de turno
                  <select
                    value={closeDraft.type}
                    onChange={(event) =>
                      setCloseDraft((prev) => ({
                        ...prev,
                        type: event.target.value as ClosingDraft['type'],
                      }))
                    }
                  >
                    {shiftTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {formatShiftType(option)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="q-field-grid-3">
                <label className="q-field">
                  Fondo inicial
                  <input
                    type="number"
                    step="0.01"
                    value={closeDraft.openingCash}
                    onChange={(event) =>
                      setCloseDraft((prev) => ({ ...prev, openingCash: asNumber(event.target.value) }))
                    }
                  />
                </label>
                <label className="q-field">
                  Retiros
                  <input
                    type="number"
                    step="0.01"
                    value={closeDraft.cashWithdrawn}
                    onChange={(event) =>
                      setCloseDraft((prev) => ({
                        ...prev,
                        cashWithdrawn: asNumber(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className="q-field">
                  Efectivo contado
                  <input
                    type="number"
                    step="0.01"
                    value={closeDraft.countedCash}
                    readOnly={useCashBreakdownMode}
                    onChange={(event) =>
                      setCloseDraft((prev) => ({ ...prev, countedCash: asNumber(event.target.value) }))
                    }
                  />
                </label>
              </div>
              <div className="q-cash-breakdown-header">
                <button type="button" className="q-chip-btn" onClick={toggleCashBreakdownMode}>
                  {useCashBreakdownMode ? 'Usar captura manual' : 'Contar por denominaciones'}
                </button>
              </div>
              {useCashBreakdownMode ? (
                <section className="q-cash-breakdown">
                  {cashDenominationOptions.map((denomination) => {
                    const quantity = closeCashBreakdown[denomination.key] || 0
                    const subtotal = quantity * denomination.value
                    return (
                      <article className="q-cash-breakdown-row" key={denomination.key}>
                        <div>
                          <strong>{denomination.label}</strong>
                          <p className="q-table-muted">{denomination.kind}</p>
                        </div>
                        <div className="q-cash-breakdown-controls">
                          <button
                            type="button"
                            className="q-cash-breakdown-step"
                            onClick={() => setCashBreakdownQuantity(denomination.key, quantity - 1)}
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={quantity}
                            onChange={(event) => setCashBreakdownQuantity(denomination.key, asNumber(event.target.value))}
                          />
                          <button
                            type="button"
                            className="q-cash-breakdown-step"
                            onClick={() => setCashBreakdownQuantity(denomination.key, quantity + 1)}
                          >
                            +
                          </button>
                        </div>
                        <strong className="q-mono">{formatMoney(subtotal)}</strong>
                      </article>
                    )
                  })}
                  <div className="q-cash-breakdown-total">
                    <span>Total contado</span>
                    <strong className="q-mono">{formatMoney(closeCashBreakdownTotal)}</strong>
                  </div>
                </section>
              ) : null}

              <h3>Líneas de venta</h3>
              <div className="q-lines-wrap">
                {closeDraft.lines.map((line, index) => (
                  <article className="q-line-row" key={`${line.channel}-${line.method}-${index}`}>
                    <label className="q-field">
                      Canal
                      <select
                        value={line.channel}
                        onChange={(event) => {
                          const nextChannel = event.target.value as ShiftLineDraft['channel']
                          updateShiftLine(index, {
                            channel: nextChannel,
                            feePct: defaultFeeByChannel[nextChannel],
                          })
                        }}
                      >
                        {lineChannels.map((channel) => (
                          <option key={channel} value={channel}>
                            {channel}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="q-field">
                      Método
                      <select
                        value={line.method}
                        onChange={(event) =>
                          updateShiftLine(index, {
                            method: event.target.value as ShiftLineDraft['method'],
                          })
                        }
                      >
                        {lineMethods.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="q-field">
                      Monto
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.gross}
                        onChange={(event) =>
                          updateShiftLine(index, { gross: asNumber(event.target.value) })
                        }
                      />
                    </label>
                    <label className="q-field">
                      Fee %
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.feePct}
                        onChange={(event) =>
                          updateShiftLine(index, { feePct: asNumber(event.target.value) })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="q-link-btn"
                      onClick={() => removeShiftLine(index)}
                      disabled={closeDraft.lines.length <= 1}
                    >
                      Quitar
                    </button>
                  </article>
                ))}
              </div>
              <button type="button" className="q-link-btn" onClick={addShiftLine}>
                + Agregar línea
              </button>

              <label className="q-field">
                Notas
                <textarea
                  value={closeDraft.notes}
                  onChange={(event) =>
                    setCloseDraft((prev) => ({ ...prev, notes: event.target.value }))
                  }
                  rows={3}
                />
              </label>

              {closeError ? <p className="q-error-text">{closeError}</p> : null}

              <button className="q-btn q-btn-inline" type="submit" disabled={savingClose}>
                {savingClose ? 'Guardando...' : 'Guardar cierre'}
              </button>
            </section>

            <aside className="q-card q-arqueo-panel">
              <h3>Panel de arqueo en vivo</h3>
              <p>
                <span>Esperado en caja</span>
                <strong className="q-mono">{formatMoney(closingTotals.expectedCash)}</strong>
              </p>
              <p>
                <span>Contado</span>
                <strong className="q-mono">{formatMoney(closeDraft.countedCash)}</strong>
              </p>
              <div className={`q-arqueo-result ${closingTotals.difference >= 0 ? 'ok' : 'falt'}`}>
                {closingTotals.difference >= 0
                  ? 'CUADRÓ ✓'
                  : `FALTANTE −${formatMoney(Math.abs(closingTotals.difference))}`}
              </div>
            </aside>
          </form>
        </section>
      ) : null}

      {!showCloseForm && loadingClosings ? <p>Cargando cierres...</p> : null}
      {!showCloseForm && closingsError ? <p className="q-error-text">{closingsError}</p> : null}

      {!showCloseForm && !loadingClosings && !closings.length ? (
        <section className="q-card q-empty-state">
          <h3>Aún no hay cierres en este rango</h3>
          <p>Registra el primer cierre de turno de {selectedLocationName || 'la sucursal'}.</p>
          <button
            className="q-btn q-btn-inline"
            type="button"
            onClick={() => {
              resetCloseForm()
              setShowCloseForm(true)
            }}
          >
            Cerrar mi primer turno
          </button>
        </section>
      ) : null}

      {!showCloseForm && !loadingClosings && closings.length ? (
        <div className="q-table-wrap">
          <table className="q-table">
            <thead>
              <tr>
                <th>Turno</th>
                <th>Responsable</th>
                <th className="is-right">Ventas</th>
                <th className="is-right">Arqueo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {closings.map((item) => {
                const grossTotal = item.lines.reduce((sum, line) => sum + Number(line.gross), 0)
                const difference = Number(item.difference)
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="q-table-turn">
                        <strong>{formatDateFromIsoString(item.shift.date)}</strong>
                        <span>
                          {formatShiftType(item.shift.type)} · {selectedLocationName || 'Sucursal'}
                        </span>
                        {item.cashBreakdown ? (
                          <div className="q-closing-breakdown-ticket">
                            {cashDenominationOptions
                              .filter((denomination) => Number(item.cashBreakdown?.[denomination.key] || 0) > 0)
                              .map((denomination) => {
                                const quantity = Number(item.cashBreakdown?.[denomination.key] || 0)
                                const subtotal = quantity * denomination.value
                                return (
                                  <p key={`${item.id}-${denomination.key}`} className="q-mono">
                                    {denomination.label} × {quantity} = {formatMoney(subtotal)}
                                  </p>
                                )
                              })}
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td>{item.closedBy?.name || '—'}</td>
                    <td className="is-right q-mono">{formatMoney(grossTotal)}</td>
                    <td className="is-right q-mono">{formatMoney(difference)}</td>
                    <td>
                      <span className={`q-chip ${difference >= 0 ? 'ok' : 'falt'}`}>
                        {difference >= 0 ? '✓ Cuadró' : `Faltante −${formatMoney(Math.abs(difference))}`}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )

  const renderRequisitions = () => (
    <section className="q-shift-closings">
      <header className="q-section-header">
        <div>
          <h1>Requisiciones</h1>
          <p>Gestión de insumos para {selectedLocationName || 'la sucursal seleccionada'}.</p>
        </div>
      </header>

      <div className="q-filter-row q-requisitions-filter-row">
        <button
          type="button"
          className={`q-chip-btn ${activeRequisitionsTab === 'REQUISITIONS' ? 'active' : ''}`}
          onClick={() => setActiveRequisitionsTab('REQUISITIONS')}
        >
          Requisiciones
        </button>
        <button
          type="button"
          className={`q-chip-btn ${activeRequisitionsTab === 'CATALOG' ? 'active' : ''}`}
          onClick={() => setActiveRequisitionsTab('CATALOG')}
        >
          Catálogo
        </button>
      </div>

      {requisitionsSuccess ? (
        <div className="q-requisition-success-actions">
          <p className="q-success-text">{requisitionsSuccess}</p>
          {lastCreatedRequisitionItems.length ? (
            <button
              type="button"
              className="q-link-btn"
              disabled={creatingSummaryImage}
              onClick={handleOpenCreatedRequisitionsSummary}
            >
              {creatingSummaryImage ? 'Generando imagen...' : 'Compartir/descargar resumen'}
            </button>
          ) : null}
        </div>
      ) : null}
      {loadingRequisitions ? <p>Cargando requisiciones...</p> : null}
      {requisitionsError ? <p className="q-error-text">{requisitionsError}</p> : null}

      {activeRequisitionsTab === 'REQUISITIONS' ? (
        <>
          {canCreateRequisition ? (
            <button
              className="q-btn q-btn-inline q-requisition-primary-btn"
              type="button"
              onClick={() => {
                resetNewRequisitionDraft()
                setQuickItemError('')
                setShowRequisitionForm((prev) => !prev)
              }}
            >
              {showRequisitionForm ? 'Cerrar formulario' : 'Nueva requisición'}
            </button>
          ) : null}

          <div className="q-filter-row q-requisitions-filter-row">
            {requisitionFilterOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`q-chip-btn ${requisitionsFilter === option.key ? 'active' : ''}`}
                onClick={() => setRequisitionsFilter(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="q-link-btn"
            disabled={creatingSummaryImage}
            onClick={handleOpenTodayRequisitionsSummary}
          >
            {creatingSummaryImage ? 'Generando imagen...' : 'Compartir resumen del día'}
          </button>

          {showRequisitionForm ? (
            <section className="q-close-form-wrap">
              <header className="q-close-form-header">
                <h2>Nueva requisición</h2>
                <button type="button" className="q-link-btn" onClick={() => setShowRequisitionForm(false)}>
                  Volver a la lista
                </button>
              </header>
              <form className="q-close-form-grid" onSubmit={handleCreateRequisition}>
                <section className="q-card q-close-form-main">
                  <h3>Carrito de insumos</h3>
                  <div className="q-requisition-cart-search-row">
                    <label className="q-field q-requisition-cart-search">
                      Buscar producto
                      <input
                        type="text"
                        placeholder="Escribe nombre de insumo…"
                        value={requisitionSearch}
                        onChange={(event) => setRequisitionSearch(event.target.value)}
                      />
                    </label>
                    <label className="q-field q-requisition-cart-qty">
                      Cantidad
                      <input
                        type="number"
                        min={0.001}
                        step="0.001"
                        value={requisitionSearchQty}
                        onChange={(event) => setRequisitionSearchQty(asNumber(event.target.value))}
                      />
                    </label>
                  </div>
                  <div className="q-requisition-search-results">
                    {requisitionSearchResults.map((item) => {
                      const providerName = item.defaultCounterpartyId
                        ? requisitionCounterpartyById[item.defaultCounterpartyId]?.name || 'Proveedor sin nombre'
                        : 'Sin proveedor habitual'
                      return (
                        <article className="q-requisition-search-item" key={item.id}>
                          <div>
                            <strong>{item.name}</strong>
                            <p className="q-table-muted">
                              {item.unit} · {providerName}
                            </p>
                          </div>
                          <div className="q-requisition-search-item-actions">
                            <span className="q-mono">{formatMoney(asDecimal(item.lastPrice))}</span>
                            <button
                              type="button"
                              className="q-btn q-btn-inline"
                              onClick={() => addRequisitionItemToCart(item.id)}
                            >
                              Agregar
                            </button>
                          </div>
                        </article>
                      )
                    })}
                    {!requisitionSearchResults.length ? (
                      <p className="q-table-muted">No hay más productos que coincidan con la búsqueda.</p>
                    ) : null}
                  </div>
                  {!activeBusinessItems.length ? (
                    <article className="q-card q-inline-quick-item">
                      <h4>No hay insumos en catálogo</h4>
                      <p>Crea un insumo rápido para continuar sin salir del flujo.</p>
                      <div className="q-inline-quick-item-grid">
                        <label className="q-field">
                          Nombre
                          <input
                            type="text"
                            required
                            value={quickItemDraft.name}
                            onChange={(event) =>
                              setQuickItemDraft((prev) => ({ ...prev, name: event.target.value }))
                            }
                          />
                        </label>
                        <label className="q-field">
                          Unidad
                          <select
                            value={quickItemDraft.unit}
                            onChange={(event) =>
                              setQuickItemDraft((prev) => ({
                                ...prev,
                                unit: event.target.value as BusinessItem['unit'],
                              }))
                            }
                          >
                            {quickItemUnits.map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="q-field">
                          Precio
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={quickItemDraft.lastPrice}
                            onChange={(event) =>
                              setQuickItemDraft((prev) => ({ ...prev, lastPrice: asNumber(event.target.value) }))
                            }
                          />
                        </label>
                        <button className="q-btn q-btn-inline" type="button" onClick={handleCreateQuickItem} disabled={savingQuickItem}>
                          {savingQuickItem ? 'Guardando...' : 'Crear insumo'}
                        </button>
                      </div>
                      {quickItemError ? <p className="q-error-text">{quickItemError}</p> : null}
                    </article>
                  ) : null}
                  <div className="q-lines-wrap q-requisition-cart-groups">
                    {requisitionCartGroups.map((group) => (
                      <article className="q-card q-requisition-cart-group" key={group.providerKey}>
                        <header className="q-requisition-cart-group-header">
                          <h4>{group.providerName}</h4>
                          <strong className="q-mono">{formatMoney(group.subtotal)}</strong>
                        </header>
                        {group.lines.map(({ line, item }) => {
                          const index = newRequisitionDraft.lines.findIndex((entry) => entry.itemId === line.itemId)
                          if (index < 0) return null
                          return (
                            <div className="q-line-row" key={item.id}>
                              <label className="q-field">
                                Producto
                                <input type="text" value={`${item.name} (${item.unit})`} readOnly />
                              </label>
                              <label className="q-field">
                                Cantidad
                                <input
                                  type="number"
                                  min={0.001}
                                  step="0.001"
                                  value={line.qty}
                                  onChange={(event) => updateRequisitionLine(index, { qty: asNumber(event.target.value) })}
                                />
                              </label>
                              <label className="q-field">
                                Precio unitario
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={line.unitPrice}
                                  onChange={(event) =>
                                    updateRequisitionLine(index, { unitPrice: asNumber(event.target.value) })
                                  }
                                />
                              </label>
                              <p className="q-mono">{formatMoney(line.qty * line.unitPrice)}</p>
                              <button type="button" className="q-link-btn" onClick={() => removeRequisitionLine(index)}>
                                Quitar
                              </button>
                            </div>
                          )
                        })}
                      </article>
                    ))}
                    {!requisitionCartGroups.length ? (
                      <p className="q-table-muted">El carrito está vacío. Busca un producto y agrégalo.</p>
                    ) : null}
                  </div>
                  <label className="q-field">
                    Fecha de entrega esperada
                    <input
                      type="date"
                      value={newRequisitionDraft.expectedDate}
                      onChange={(event) =>
                        setNewRequisitionDraft((prev) => ({ ...prev, expectedDate: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="q-field">
                    Notas
                    <input
                      type="text"
                      placeholder="Opcional"
                      value={newRequisitionDraft.notes}
                      onChange={(event) =>
                        setNewRequisitionDraft((prev) => ({ ...prev, notes: event.target.value }))
                      }
                    />
                  </label>
                  {requisitionFormError ? <p className="q-error-text">{requisitionFormError}</p> : null}
                  <button className="q-btn q-btn-inline" type="submit" disabled={savingRequisition || !activeBusinessItems.length}>
                    {savingRequisition ? 'Guardando...' : 'Crear requisición'}
                  </button>
                </section>

                <aside className="q-card q-arqueo-panel">
                  <h3>Total estimado</h3>
                  <p>
                    <span>Estimado</span>
                    <strong className="q-mono">{formatMoney(requisitionEstimatedTotal)}</strong>
                  </p>
                </aside>
              </form>
            </section>
          ) : null}

          {!loadingRequisitions && !requisitionsError && !requisitions.length ? (
            <section className="q-card q-empty-state">
              <h3>No hay requisiciones en este filtro</h3>
              <p>Crea la primera requisición para empezar a controlar compras por sucursal.</p>
              {canCreateRequisition ? (
                <button
                  className="q-btn q-btn-inline"
                  type="button"
                  onClick={() => {
                    resetNewRequisitionDraft()
                    setShowRequisitionForm(true)
                  }}
                >
                  Nueva requisición
                </button>
              ) : null}
            </section>
          ) : null}

          {!loadingRequisitions && !requisitionsError && requisitions.length ? (
            <div className="q-table-wrap">
              <table className="q-table">
                <thead>
                  <tr>
                    <th>Folio</th>
                    <th>Proveedor</th>
                    <th>Solicitó</th>
                    <th>Entrega</th>
                    <th className="is-right">Costeo estimado</th>
                    <th className="is-right">Recibido</th>
                    <th>Estado</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {requisitions.map((requisition) => {
                    const isExpanded = expandedRequisitionId === requisition.id
                    const canAssignProvider = canAssignPendingRequisitionProvider(requisition)
                    const assignDraft = getAssignRequisitionDraft(requisition)
                    return (
                      <Fragment key={requisition.id}>
                        <tr className="q-requisition-row" onClick={() => toggleRequisitionDetail(requisition)}>
                          <td className="q-mono">#{requisition.folio}</td>
                          <td>{requisition.counterparty?.name || 'Sin asignar'}</td>
                          <td>{requisition.requestedBy?.name || '—'}</td>
                          <td>
                            {requisition.expectedDate ? (
                              <span
                                className={`q-requisition-expected ${isRequisitionOverdue(requisition.expectedDate, requisition.status) ? 'is-overdue' : ''}`}
                              >
                                Entrega: {formatDayMonthFromIsoString(requisition.expectedDate)}
                              </span>
                            ) : (
                              <span className="q-table-muted">Entrega: —</span>
                            )}
                          </td>
                          <td className="is-right q-mono">{formatMoney(asDecimal(requisition.estimatedTotal))}</td>
                          <td className="is-right q-mono">
                            {requisition.receivedTotal ? formatMoney(asDecimal(requisition.receivedTotal)) : '—'}
                          </td>
                          <td>
                            <span className={`q-chip ${requisitionStatusChipClass(requisition.status)}`}>
                              {formatRequisitionStatus(requisition.status)}
                            </span>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="q-link-btn"
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleRequisitionDetail(requisition)
                              }}
                            >
                              {isExpanded ? 'Ocultar' : 'Ver'}
                            </button>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="q-requisition-detail-row">
                            <td colSpan={8}>
                              <div className="q-requisition-detail">
                                <p className="q-table-muted">
                                  Solicitó: {requisition.requestedBy?.name || '—'} · Fecha:{' '}
                                  {formatDateFromIsoString(requisition.createdAt)}
                                </p>
                                <p className={`q-table-muted q-requisition-expected-detail ${isRequisitionOverdue(requisition.expectedDate, requisition.status) ? 'is-overdue' : ''}`}>
                                  Entrega:{' '}
                                  {requisition.expectedDate
                                    ? formatDayMonthFromIsoString(requisition.expectedDate)
                                    : '—'}
                                </p>
                                {requisition.notes ? (
                                  <p className="q-table-muted">Notas: {requisition.notes}</p>
                                ) : null}
                                <div className="q-requisition-lines">
                                  {requisition.lines.map((line) => {
                                    const subtotal = asDecimal(line.qty) * asDecimal(line.unitPrice)
                                    return (
                                      <div key={line.id} className="q-requisition-line">
                                        <span>{line.item.name}</span>
                                        <span className="q-mono">{asDecimal(line.qty)} {line.item.unit}</span>
                                        <span className="q-mono">{formatMoney(asDecimal(line.unitPrice))}</span>
                                        <strong className="q-mono q-requisition-line-subtotal">{formatMoney(subtotal)}</strong>
                                      </div>
                                    )
                                  })}
                                </div>
                                {canAssignProvider ? (
                                  <div className="q-requisition-assign-block">
                                    <label className="q-field">
                                      Asignar proveedor
                                      <select
                                        value={assignDraft.counterpartyId}
                                        onChange={(event) =>
                                          setAssignDraftByRequisitionId((prev) => ({
                                            ...prev,
                                            [requisition.id]: {
                                              ...assignDraft,
                                              counterpartyId: event.target.value,
                                            },
                                          }))
                                        }
                                      >
                                        <option value="">Selecciona proveedor</option>
                                        {activeCounterparties.map((counterparty) => (
                                          <option key={counterparty.id} value={counterparty.id}>
                                            {counterparty.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                    <div className="q-table-actions">
                                      <button
                                        type="button"
                                        className="q-link-btn"
                                        disabled={rowActionLoadingId === `assign-${requisition.id}`}
                                        onClick={() => handleAssignCounterpartyToRequisition(requisition)}
                                      >
                                        Asignar proveedor
                                      </button>
                                      <button
                                        type="button"
                                        className="q-link-btn"
                                        onClick={() =>
                                          setAssignDraftByRequisitionId((prev) => ({
                                            ...prev,
                                            [requisition.id]: {
                                              ...assignDraft,
                                              showInlineCreate: !assignDraft.showInlineCreate,
                                            },
                                          }))
                                        }
                                      >
                                        {assignDraft.showInlineCreate ? 'Cerrar alta rápida' : 'Crear proveedor'}
                                      </button>
                                    </div>
                                    {assignDraft.showInlineCreate ? (
                                      <div className="q-payable-inline-counterparty-form">
                                        <div className="q-field-grid-3">
                                          <label className="q-field">
                                            Nombre
                                            <input
                                              type="text"
                                              value={requisitionCounterpartyDraft.name}
                                              onChange={(event) =>
                                                setRequisitionCounterpartyDraft((prev) => ({
                                                  ...prev,
                                                  name: event.target.value,
                                                }))
                                              }
                                            />
                                          </label>
                                          <label className="q-field">
                                            Tipo
                                            <select
                                              value={requisitionCounterpartyDraft.type}
                                              onChange={(event) =>
                                                setRequisitionCounterpartyDraft((prev) => ({
                                                  ...prev,
                                                  type: event.target.value as PayableCounterpartyDraft['type'],
                                                }))
                                              }
                                            >
                                              <option value="SUPPLIER">Proveedor</option>
                                              <option value="LENDER">Prestamista</option>
                                            </select>
                                          </label>
                                          <label className="q-field">
                                            Teléfono (opcional)
                                            <input
                                              type="text"
                                              value={requisitionCounterpartyDraft.phone}
                                              onChange={(event) =>
                                                setRequisitionCounterpartyDraft((prev) => ({
                                                  ...prev,
                                                  phone: event.target.value,
                                                }))
                                              }
                                            />
                                          </label>
                                        </div>
                                        <button
                                          type="button"
                                          className="q-link-btn"
                                          disabled={rowActionLoadingId === `assign-create-${requisition.id}`}
                                          onClick={() => handleCreateInlineRequisitionCounterparty(requisition)}
                                        >
                                          Crear proveedor
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                                <div className="q-table-actions">
                                  {canApproveOrCancelRequisition && requisition.status === 'PENDING_APPROVAL' ? (
                                    <button
                                      type="button"
                                      className="q-link-btn"
                                      disabled={rowActionLoadingId === requisition.id}
                                      onClick={() => handleApproveRequisition(requisition.id)}
                                    >
                                      Aprobar
                                    </button>
                                  ) : null}
                                  {canReceiveRequisition && requisition.status === 'APPROVED' ? (
                                    <button type="button" className="q-link-btn" onClick={() => openReceiveModal(requisition)}>
                                      Recibir
                                    </button>
                                  ) : null}
                                  {requisition.counterparty &&
                                  (requisition.status === 'PENDING_APPROVAL' || requisition.status === 'APPROVED') ? (
                                    <button type="button" className="q-link-btn" onClick={() => handleSendOrderWhatsApp(requisition)}>
                                      Enviar pedido
                                    </button>
                                  ) : null}
                                  {canApproveOrCancelRequisition &&
                                  requisition.status !== 'RECEIVED' &&
                                  requisition.status !== 'CANCELLED' ? (
                                    <button
                                      type="button"
                                      className="q-link-btn q-link-danger"
                                      disabled={rowActionLoadingId === requisition.id}
                                      onClick={() => handleCancelRequisition(requisition.id)}
                                    >
                                      Cancelar
                                    </button>
                                  ) : null}
                                </div>
                                {requisition.counterparty &&
                                phoneCaptureCounterpartyId === requisition.counterparty.id &&
                                !requisition.counterparty.phone ? (
                                  <div className="q-inline-phone-form">
                                    <input
                                      type="text"
                                      placeholder="Teléfono proveedor"
                                      value={phoneCaptureValue}
                                      onChange={(event) => setPhoneCaptureValue(event.target.value)}
                                    />
                                    <button
                                      type="button"
                                      className="q-link-btn"
                                      disabled={savingCatalog}
                                      onClick={() => handleSavePhoneAndSendOrder(requisition)}
                                    >
                                      Guardar y enviar
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <section className="q-catalog-grid">
          <article className="q-card">
            <div className="q-catalog-header">
              <h3>Insumos</h3>
              <label className="q-toggle-inline">
                <input
                  type="checkbox"
                  checked={showInactiveItems}
                  onChange={(event) => setShowInactiveItems(event.target.checked)}
                />
                Mostrar inactivos
              </label>
            </div>
            <div className="q-inline-quick-item-grid">
              <label className="q-field">
                Nombre
                <input
                  type="text"
                  value={catalogItemDraft.name}
                  onChange={(event) => setCatalogItemDraft((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label className="q-field">
                Unidad
                <select
                  value={catalogItemDraft.unit}
                  onChange={(event) =>
                    setCatalogItemDraft((prev) => ({ ...prev, unit: event.target.value as BusinessItem['unit'] }))
                  }
                >
                  {quickItemUnits.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
              <label className="q-field">
                Categoría
                <input
                  type="text"
                  value={catalogItemDraft.category}
                  onChange={(event) => setCatalogItemDraft((prev) => ({ ...prev, category: event.target.value }))}
                />
              </label>
              <label className="q-field">
                Último precio
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={catalogItemDraft.lastPrice}
                  onChange={(event) => setCatalogItemDraft((prev) => ({ ...prev, lastPrice: asNumber(event.target.value) }))}
                />
              </label>
              <label className="q-field">
                Proveedor habitual
                <select
                  value={catalogItemDraft.defaultCounterpartyId}
                  onChange={(event) =>
                    setCatalogItemDraft((prev) => ({ ...prev, defaultCounterpartyId: event.target.value }))
                  }
                >
                  <option value="">Sin asignar</option>
                  {activeCounterparties.map((counterparty) => (
                    <option key={counterparty.id} value={counterparty.id}>
                      {counterparty.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="q-btn q-btn-inline"
                disabled={savingCatalog}
                onClick={() => handleSaveCatalogItem(Boolean(editingItemId))}
              >
                {editingItemId ? 'Guardar insumo' : 'Crear insumo'}
              </button>
              {editingItemId ? (
                <button
                  type="button"
                  className="q-link-btn"
                  onClick={() => {
                    setEditingItemId('')
                    setCatalogItemDraft({
                      name: '',
                      unit: 'PZA',
                      category: '',
                      lastPrice: 0,
                      defaultCounterpartyId: '',
                    })
                  }}
                >
                  Cancelar edición
                </button>
              ) : null}
            </div>
            <div className="q-table-wrap">
              <table className="q-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Unidad</th>
                    <th>Categoría</th>
                    <th className="is-right">Último precio</th>
                    <th>Proveedor habitual</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {businessItems.map((item) => (
                    <tr key={item.id} className={item.active ? '' : 'q-row-inactive'}>
                      <td>{item.name}</td>
                      <td>{item.unit}</td>
                      <td>{item.category || '—'}</td>
                      <td className="is-right q-mono">{formatMoney(asDecimal(item.lastPrice))}</td>
                      <td>{item.defaultCounterparty?.name || 'Sin asignar'}</td>
                      <td>
                        <button
                          type="button"
                          className="q-link-btn"
                          onClick={() => {
                            setEditingItemId(item.id)
                            setCatalogItemDraft({
                              name: item.name,
                              unit: item.unit,
                              category: item.category || '',
                              lastPrice: asDecimal(item.lastPrice),
                              defaultCounterpartyId: item.defaultCounterpartyId || '',
                            })
                          }}
                        >
                          Editar
                        </button>
                        {item.active ? (
                          <button
                            type="button"
                            className="q-link-btn q-link-danger"
                            disabled={rowActionLoadingId === `item-delete-${item.id}`}
                            onClick={() => handleDeleteCatalogItem(item)}
                          >
                            Eliminar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="q-link-btn"
                            disabled={rowActionLoadingId === `item-reactivate-${item.id}`}
                            onClick={() => handleReactivateCatalogItem(item.id)}
                          >
                            Reactivar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="q-card">
            <div className="q-catalog-header">
              <h3>Proveedores</h3>
              <label className="q-toggle-inline">
                <input
                  type="checkbox"
                  checked={showInactiveCounterparties}
                  onChange={(event) => setShowInactiveCounterparties(event.target.checked)}
                />
                Mostrar inactivos
              </label>
            </div>
            <div className="q-inline-quick-item-grid">
              <label className="q-field">
                Nombre
                <input
                  type="text"
                  value={catalogCounterpartyDraft.name}
                  onChange={(event) => setCatalogCounterpartyDraft((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label className="q-field">
                Teléfono
                <input
                  type="text"
                  value={catalogCounterpartyDraft.phone}
                  onChange={(event) => setCatalogCounterpartyDraft((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </label>
              <label className="q-field">
                Términos
                <input
                  type="text"
                  value={catalogCounterpartyDraft.paymentTerms}
                  onChange={(event) =>
                    setCatalogCounterpartyDraft((prev) => ({ ...prev, paymentTerms: event.target.value }))
                  }
                />
              </label>
              <label className="q-field">
                Notas
                <input
                  type="text"
                  value={catalogCounterpartyDraft.notes}
                  onChange={(event) => setCatalogCounterpartyDraft((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </label>
              <button
                type="button"
                className="q-btn q-btn-inline"
                disabled={savingCatalog}
                onClick={() => handleSaveCounterparty(Boolean(editingCounterpartyId))}
              >
                {editingCounterpartyId ? 'Guardar proveedor' : 'Crear proveedor'}
              </button>
              {editingCounterpartyId ? (
                <button
                  type="button"
                  className="q-link-btn"
                  onClick={() => {
                    setEditingCounterpartyId('')
                    setCatalogCounterpartyDraft({
                      name: '',
                      phone: '',
                      paymentTerms: '',
                      notes: '',
                    })
                  }}
                >
                  Cancelar edición
                </button>
              ) : null}
            </div>
            <div className="q-table-wrap">
              <table className="q-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {counterparties.map((counterparty) => (
                    <tr key={counterparty.id} className={counterparty.active ? '' : 'q-row-inactive'}>
                      <td>{counterparty.name}</td>
                      <td>{counterparty.phone || '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="q-link-btn"
                          onClick={() => {
                            setEditingCounterpartyId(counterparty.id)
                            setCatalogCounterpartyDraft({
                              name: counterparty.name,
                              phone: counterparty.phone || '',
                              paymentTerms: counterparty.paymentTerms || '',
                              notes: counterparty.notes || '',
                            })
                          }}
                        >
                          Editar
                        </button>
                        {counterparty.active ? (
                          <button
                            type="button"
                            className="q-link-btn q-link-danger"
                            disabled={rowActionLoadingId === `counterparty-delete-${counterparty.id}`}
                            onClick={() => handleDeleteCatalogCounterparty(counterparty)}
                          >
                            Eliminar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="q-link-btn"
                            disabled={rowActionLoadingId === `counterparty-reactivate-${counterparty.id}`}
                            onClick={() => handleReactivateCatalogCounterparty(counterparty.id)}
                          >
                            Reactivar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {showReceiveModal && receiveTarget ? (
        <div className="q-modal-overlay" role="presentation" onClick={closeReceiveModal}>
          <section className="q-modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <header className="q-close-form-header">
              <h2>Recibir requisición #{receiveTarget.folio}</h2>
              <button type="button" className="q-link-btn" onClick={closeReceiveModal}>
                Cerrar
              </button>
            </header>

            <form className="q-modal-content" onSubmit={handleReceiveRequisition}>
              {!receiveTarget.counterpartyId ? (
                <label className="q-field">
                  Proveedor
                  <select
                    value={receiveDraft.counterpartyId}
                    onChange={(event) =>
                      setReceiveDraft((prev) => ({
                        ...prev,
                        counterpartyId: event.target.value,
                      }))
                    }
                    required
                  >
                    <option value="">Selecciona proveedor</option>
                    {activeCounterparties.map((counterparty) => (
                      <option key={counterparty.id} value={counterparty.id}>
                        {counterparty.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="q-table-muted">Proveedor: {receiveTarget.counterparty?.name || 'Asignado'}</p>
              )}
              <label className="q-field">
                Fecha de recepción
                <input
                  type="date"
                  value={receiveDraft.receivedDate}
                  onChange={(event) =>
                    setReceiveDraft((prev) => ({
                      ...prev,
                      receivedDate: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <p className="q-field-hint">El gasto se registrará en esta fecha.</p>

              <div className="q-lines-wrap">
                {receiveDraft.lines.map((line, index) => (
                  <article className="q-line-row" key={line.lineId}>
                    <label className="q-field">
                      Insumo
                      <input type="text" value={line.itemName} readOnly />
                    </label>
                    <label className="q-field">
                      Qty estimada
                      <input type="number" value={line.qty} readOnly />
                    </label>
                    <label className="q-field">
                      Precio estimado
                      <input type="number" value={line.unitPrice} readOnly />
                    </label>
                    <label className="q-field">
                      Qty recibida
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={line.receivedQty}
                        onChange={(event) =>
                          setReceiveDraft((prev) => {
                            const lines = [...prev.lines]
                            lines[index] = { ...lines[index], receivedQty: asNumber(event.target.value) }
                            return { ...prev, lines }
                          })
                        }
                      />
                    </label>
                    <label className="q-field">
                      Precio real
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.actualPrice}
                        onChange={(event) =>
                          setReceiveDraft((prev) => {
                            const lines = [...prev.lines]
                            lines[index] = { ...lines[index], actualPrice: asNumber(event.target.value) }
                            return { ...prev, lines }
                          })
                        }
                      />
                    </label>
                  </article>
                ))}
              </div>

              <p className="q-receive-total">
                Total real: <strong className="q-mono">{formatMoney(receiveRealTotal)}</strong>
              </p>
              {receiveError ? <p className="q-error-text">{receiveError}</p> : null}
              <button className="q-btn q-btn-inline" type="submit" disabled={savingReceive}>
                {savingReceive ? 'Guardando...' : 'Confirmar recepción'}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  )
  const renderPayables = () => (
    <section className="q-shift-closings">
      <header className="q-section-header">
        <div>
          <h1>Proveedores y adeudos</h1>
          <p>Control de cuentas por pagar y pagos a proveedores/prestamistas.</p>
        </div>
        {canCreateEnvelope ? (
          <button
            className="q-btn q-btn-inline"
            type="button"
            onClick={() => {
              resetPayableCreateDraft()
              setShowPayableForm((prev) => !prev)
            }}
          >
            {showPayableForm ? 'Cerrar formulario' : 'Registrar adeudo'}
          </button>
        ) : null}
      </header>

      <div className="q-payables-kpis">
        <article className="q-card q-payables-kpi">
          <span>Total por pagar</span>
          <strong className="q-mono">{formatMoney(payablesTotal)}</strong>
        </article>
        <article className={`q-card q-payables-kpi ${payablesOverdue > 0 ? 'falt' : 'ok'}`}>
          <span>Vencido</span>
          <strong className="q-mono">{formatMoney(payablesOverdue)}</strong>
        </article>
      </div>

      {payablesSuccess ? <p className="q-success-text">{payablesSuccess}</p> : null}
      {payablesError ? <p className="q-error-text">{payablesError}</p> : null}

      {showPayableForm ? (
        <form className="q-card q-payables-form" onSubmit={handleCreatePayable}>
          <div className="q-field-grid-3">
            <label className="q-field">
              Acreedor
              <select
                value={payableCreateDraft.counterpartyId}
                onChange={(event) => setPayableCreateDraft((prev) => ({ ...prev, counterpartyId: event.target.value }))}
                required
              >
                <option value="">Selecciona acreedor</option>
                {activePayablesCounterparties.map((counterparty) => (
                  <option key={counterparty.id} value={counterparty.id}>
                    {counterparty.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="q-link-btn"
                onClick={() => setShowInlinePayableCounterpartyForm((prev) => !prev)}
              >
                {showInlinePayableCounterpartyForm ? 'Cerrar alta rápida' : 'Nuevo acreedor'}
              </button>
            </label>
            <label className="q-field">
              Tipo
              <select
                value={payableCreateDraft.kind}
                onChange={(event) =>
                  setPayableCreateDraft((prev) => ({
                    ...prev,
                    kind: event.target.value as PayableCreateDraft['kind'],
                  }))
                }
              >
                <option value="GOODS">Insumo</option>
                <option value="SERVICE">Servicio</option>
                <option value="LOAN">Préstamo</option>
              </select>
            </label>
            <label className="q-field">
              Referencia
              <input
                type="text"
                value={payableCreateDraft.reference}
                onChange={(event) => setPayableCreateDraft((prev) => ({ ...prev, reference: event.target.value }))}
              />
            </label>
          </div>
          <div className="q-field-grid-3">
            <label className="q-field">
              Fecha
              <input
                type="date"
                value={payableCreateDraft.date}
                onChange={(event) => setPayableCreateDraft((prev) => ({ ...prev, date: event.target.value }))}
                required
              />
            </label>
            <label className="q-field">
              Vence
              <input
                type="date"
                value={payableCreateDraft.dueDate}
                onChange={(event) => setPayableCreateDraft((prev) => ({ ...prev, dueDate: event.target.value }))}
              />
            </label>
            <label className="q-field">
              Monto total
              <input
                type="number"
                min={0}
                step="0.01"
                value={payableCreateDraft.total}
                onChange={(event) => setPayableCreateDraft((prev) => ({ ...prev, total: asNumber(event.target.value) }))}
                required
              />
            </label>
          </div>
          <div className="q-field-grid-3">
            <label className="q-field">
              Sucursal
              <select
                value={payableCreateDraft.locationId}
                onChange={(event) => setPayableCreateDraft((prev) => ({ ...prev, locationId: event.target.value }))}
              >
                <option value="">Sin sucursal</option>
                {(selectedBusiness?.locations || []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="q-field">
              Notas
              <input
                type="text"
                value={payableCreateDraft.notes}
                onChange={(event) => setPayableCreateDraft((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </label>
          </div>
          <button className="q-btn q-btn-inline" type="submit" disabled={savingPayables}>
            {savingPayables ? 'Guardando...' : 'Guardar adeudo'}
          </button>

          {showInlinePayableCounterpartyForm ? (
            <div className="q-payable-inline-counterparty-form">
              <div className="q-field-grid-3">
                <label className="q-field">
                  Nombre
                  <input
                    type="text"
                    value={payableCounterpartyDraft.name}
                    onChange={(event) =>
                      setPayableCounterpartyDraft((prev) => ({ ...prev, name: event.target.value }))
                    }
                    required
                  />
                </label>
                <label className="q-field">
                  Tipo
                  <select
                    value={payableCounterpartyDraft.type}
                    onChange={(event) =>
                      setPayableCounterpartyDraft((prev) => ({
                        ...prev,
                        type: event.target.value as PayableCounterpartyDraft['type'],
                      }))
                    }
                  >
                    <option value="SUPPLIER">Proveedor</option>
                    <option value="LENDER">Prestamista</option>
                  </select>
                </label>
                <label className="q-field">
                  Teléfono (opcional)
                  <input
                    type="text"
                    value={payableCounterpartyDraft.phone}
                    onChange={(event) =>
                      setPayableCounterpartyDraft((prev) => ({ ...prev, phone: event.target.value }))
                    }
                  />
                </label>
              </div>
              <button
                className="q-btn q-btn-inline"
                type="button"
                disabled={savingPayables}
                onClick={() => handleCreateInlinePayableCounterparty()}
              >
                {savingPayables ? 'Guardando...' : 'Crear acreedor'}
              </button>
            </div>
          ) : null}
        </form>
      ) : null}

      {loadingPayables ? <p>Cargando adeudos...</p> : null}

      {!loadingPayables && !payablesItems.length ? (
        <section className="q-card q-empty-state">
          <h3>No hay adeudos activos</h3>
          <p>Cuando registres compras o préstamos pendientes aparecerán aquí.</p>
        </section>
      ) : null}

      {!loadingPayables && payablesItems.length ? (
        <div className="q-payables-grid">
          {payablesItems.map((row) => {
            const isExpanded = expandedCounterpartyId === row.counterparty.id
            return (
              <article key={row.counterparty.id} className="q-card q-payable-card">
                <div className="q-payable-top">
                  <div>
                    <h3>{row.counterparty.name}</h3>
                    <span className={`q-chip ${row.counterparty.type === 'LENDER' ? 'pending' : 'ok'}`}>
                      {row.counterparty.type === 'LENDER' ? 'Prestamista' : 'Proveedor'}
                    </span>
                  </div>
                  <strong className="q-mono q-payable-saldo">{formatMoney(row.saldo)}</strong>
                </div>
                <button
                  type="button"
                  className="q-link-btn"
                  onClick={() => setExpandedCounterpartyId((prev) => (prev === row.counterparty.id ? '' : row.counterparty.id))}
                >
                  {isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                </button>

                {isExpanded ? (
                  <div className="q-payable-purchases">
                    {row.purchases.map((purchase) => {
                      const saldo = Math.max(asDecimal(purchase.total) - asDecimal(purchase.paidAmount), 0)
                      const isOverdue = Boolean(purchase.dueDate && purchase.dueDate.slice(0, 10) < getTodayDateInput())
                      const draft = getPayablePaymentDraft(purchase)
                      const payments = purchasePaymentsByPurchase[purchase.id] || []
                      return (
                        <article className="q-payable-purchase-row" key={purchase.id}>
                          <div className="q-payable-purchase-head">
                            <div>
                              <strong>{purchase.reference || formatPayableKind(purchase.kind)}</strong>
                              <p className="q-table-muted">
                                {formatPayableKind(purchase.kind)} · {formatDateFromIsoString(purchase.date)}
                              </p>
                            </div>
                            <span className={`q-chip ${payableStatusChipClass(purchase.status)}`}>
                              {formatPayableStatus(purchase.status)}
                            </span>
                          </div>
                          <div className="q-payable-purchase-stats">
                            <span>
                              Vence:{' '}
                              <strong className={isOverdue ? 'q-error-text' : ''}>
                                {purchase.dueDate ? formatDateFromIsoString(purchase.dueDate) : '—'}
                              </strong>
                            </span>
                            <span>Total: <strong className="q-mono">{formatMoney(asDecimal(purchase.total))}</strong></span>
                            <span>Pagado: <strong className="q-mono">{formatMoney(asDecimal(purchase.paidAmount))}</strong></span>
                            <span>Saldo: <strong className="q-mono">{formatMoney(saldo)}</strong></span>
                          </div>
                          <div className="q-table-actions">
                            <button
                              type="button"
                              className="q-link-btn"
                              onClick={() => {
                                setActivePayPurchaseId((prev) => (prev === purchase.id ? '' : purchase.id))
                                if (!purchasePaymentsByPurchase[purchase.id]) {
                                  loadPurchasePayments(purchase.id).catch(() => {})
                                }
                              }}
                            >
                              Abonar
                            </button>
                            <button
                              type="button"
                              className="q-link-btn"
                              onClick={() => loadPurchasePayments(purchase.id)}
                            >
                              Historial
                            </button>
                          </div>

                          {activePayPurchaseId === purchase.id ? (
                            <div className="q-payable-payment-form">
                              <input
                                type="date"
                                value={draft.date}
                                onChange={(event) =>
                                  setPayablePaymentDraftByPurchase((prev) => ({
                                    ...prev,
                                    [purchase.id]: { ...draft, date: event.target.value },
                                  }))
                                }
                              />
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={draft.amount}
                                onChange={(event) =>
                                  setPayablePaymentDraftByPurchase((prev) => ({
                                    ...prev,
                                    [purchase.id]: { ...draft, amount: asNumber(event.target.value) },
                                  }))
                                }
                              />
                              <select
                                value={draft.method}
                                onChange={(event) =>
                                  setPayablePaymentDraftByPurchase((prev) => ({
                                    ...prev,
                                    [purchase.id]: {
                                      ...draft,
                                      method: event.target.value as PayablePaymentDraft['method'],
                                    },
                                  }))
                                }
                              >
                                <option value="EFECTIVO">EFECTIVO</option>
                                <option value="TARJETA">TARJETA</option>
                                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                                <option value="APP">APP</option>
                                <option value="OTRO">OTRO</option>
                              </select>
                              {purchase.kind === 'LOAN' ? (
                                <select
                                  value={draft.categoryId}
                                  onChange={(event) =>
                                    setPayablePaymentDraftByPurchase((prev) => ({
                                      ...prev,
                                      [purchase.id]: { ...draft, categoryId: event.target.value },
                                    }))
                                  }
                                >
                                  <option value="">Selecciona categoría</option>
                                  {expenseCategories.map((category) => (
                                    <option key={category.id} value={category.id}>
                                      {category.name}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                              <button className="q-btn q-btn-inline" type="button" onClick={() => handlePayPurchase(purchase)}>
                                Confirmar abono
                              </button>
                            </div>
                          ) : null}

                          {loadingPaymentsByPurchase[purchase.id] ? <p>Cargando pagos...</p> : null}
                          {payments.length ? (
                            <div className="q-payable-history-list">
                              {payments.map((payment) => (
                                <div key={payment.id} className="q-payable-history-row">
                                  <span>{formatDateFromIsoString(payment.date)}</span>
                                  <strong className="q-mono">{formatMoney(asDecimal(payment.amount))}</strong>
                                  <span>{payment.method}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : null}
    </section>
  )

  const renderExpenses = () => (
    <section className="q-shift-closings">
      <header className="q-section-header">
        <div>
          <h1>Gastos</h1>
          <p>Control de egresos de {selectedLocationName || 'la sucursal seleccionada'}.</p>
        </div>
        <div className="q-actions-row">
          <div className="q-month-nav">
            <button type="button" className="q-chip-btn" onClick={() => setGastosMonth((prev) => shiftMonth(prev, -1))}>
              ←
            </button>
            <strong>{gastosMonthLabel}</strong>
            <button type="button" className="q-chip-btn" onClick={() => setGastosMonth((prev) => shiftMonth(prev, 1))}>
              →
            </button>
          </div>
          {canRegisterExpense ? (
            <button
              className="q-btn q-btn-inline"
              type="button"
              onClick={() => {
                resetExpenseDraft()
                setShowExpenseForm((prev) => !prev)
              }}
            >
              {showExpenseForm ? 'Cerrar formulario' : 'Registrar gasto'}
            </button>
          ) : null}
        </div>
      </header>

      <article className="q-card q-expenses-total-card">
        <span>Total del mes</span>
        <strong className="q-mono">{formatMoney(expensesMonthTotal)}</strong>
      </article>

      <div className="q-filter-row q-requisitions-filter-row">
        <label className="q-expenses-filter">
          Categoría
          <select value={expensesCategoryFilter} onChange={(event) => setExpensesCategoryFilter(event.target.value)}>
            <option value="">Todas</option>
            {expenseCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {expensesSuccess ? <p className="q-success-text">{expensesSuccess}</p> : null}
      {expensesError ? <p className="q-error-text">{expensesError}</p> : null}

      {showExpenseForm ? (
        <form className="q-card q-expense-form" onSubmit={handleCreateExpense}>
          <div className="q-field-grid-3">
            <label className="q-field">
              Fecha
              <input
                type="date"
                value={expenseDraft.date}
                onChange={(event) => setExpenseDraft((prev) => ({ ...prev, date: event.target.value }))}
                required
              />
            </label>
            <label className="q-field">
              Categoría
              <select
                value={expenseDraft.categoryId}
                onChange={(event) => setExpenseDraft((prev) => ({ ...prev, categoryId: event.target.value }))}
                required
              >
                <option value="">Selecciona categoría</option>
                {expenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="q-field">
              Método
              <select
                value={expenseDraft.method}
                onChange={(event) =>
                  setExpenseDraft((prev) => ({
                    ...prev,
                    method: event.target.value as ExpenseDraft['method'],
                  }))
                }
              >
                <option value="EFECTIVO">EFECTIVO</option>
                <option value="TARJETA">TARJETA</option>
                <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                <option value="OTRO">OTRO</option>
              </select>
            </label>
          </div>
          <div className="q-field-grid-3">
            <label className="q-field">
              Concepto
              <input
                type="text"
                value={expenseDraft.concept}
                onChange={(event) => setExpenseDraft((prev) => ({ ...prev, concept: event.target.value }))}
                required
              />
            </label>
            <label className="q-field">
              Monto
              <input
                type="number"
                min={0}
                step="0.01"
                value={expenseDraft.amount}
                onChange={(event) => setExpenseDraft((prev) => ({ ...prev, amount: asNumber(event.target.value) }))}
                required
              />
            </label>
            <label className="q-field">
              Proveedor (opcional)
              <select
                value={expenseDraft.counterpartyId}
                onChange={(event) => setExpenseDraft((prev) => ({ ...prev, counterpartyId: event.target.value }))}
              >
                <option value="">Sin proveedor</option>
                {activeCounterparties.map((counterparty) => (
                  <option key={counterparty.id} value={counterparty.id}>
                    {counterparty.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="q-toggle-inline q-expense-check">
            <input
              type="checkbox"
              checked={expenseDraft.paidFromCash}
              onChange={(event) => setExpenseDraft((prev) => ({ ...prev, paidFromCash: event.target.checked }))}
            />
            Pagado de caja
          </label>
          <button className="q-btn q-btn-inline" type="submit" disabled={savingExpense}>
            {savingExpense ? 'Guardando...' : 'Guardar gasto'}
          </button>
        </form>
      ) : null}

      {loadingExpenses ? <p>Cargando gastos...</p> : null}

      {!loadingExpenses && !expenses.length ? (
        <section className="q-card q-empty-state">
          <h3>No hay gastos para este periodo</h3>
          <p>Registra el primer gasto para empezar a ver el control mensual.</p>
          {canRegisterExpense ? (
            <button
              className="q-btn q-btn-inline"
              type="button"
              onClick={() => {
                resetExpenseDraft()
                setShowExpenseForm(true)
              }}
            >
              Registrar gasto
            </button>
          ) : null}
        </section>
      ) : null}

      {!loadingExpenses && expenses.length ? (
        <div className="q-table-wrap">
          <table className="q-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th>Método</th>
                <th className="is-right">Monto</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{formatDateFromIsoString(expense.date).slice(0, 5)}</td>
                  <td>
                    <div className="q-table-turn">
                      <strong>{expense.concept}</strong>
                      <span>{expense.category?.name || 'Sin categoría'}</span>
                    </div>
                  </td>
                  <td>
                    <span>{expense.method}</span>
                    {expense.source !== 'MANUAL' ? <span className="q-chip q-chip-auto">auto</span> : null}
                  </td>
                  <td className="is-right q-mono">{formatMoney(asDecimal(expense.amount))}</td>
                  <td>
                    {canDeleteManualExpense && expense.source === 'MANUAL' ? (
                      <button
                        type="button"
                        className="q-link-btn q-link-danger"
                        disabled={rowActionLoadingId === `expense-${expense.id}`}
                        onClick={() => handleDeleteExpense(expense)}
                      >
                        Eliminar
                      </button>
                    ) : (
                      <span className="q-table-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )

  const renderPnl = () => (
    <section className="q-shift-closings">
      <header className="q-section-header">
        <div>
          <h1>P&L y reportes</h1>
          <p>Estado de resultados de {selectedLocationName || 'la sucursal seleccionada'}.</p>
        </div>
        <div className="q-month-nav">
          <button type="button" className="q-chip-btn" onClick={() => setPnlMonth((prev) => shiftMonth(prev, -1))}>
            ←
          </button>
          <strong>{pnlMonthLabel}</strong>
          <button type="button" className="q-chip-btn" onClick={() => setPnlMonth((prev) => shiftMonth(prev, 1))}>
            →
          </button>
        </div>
      </header>

      {loadingPnl ? <p>Cargando P&L...</p> : null}
      {pnlError ? <p className="q-error-text">{pnlError}</p> : null}

      {!loadingPnl && pnlSummary && pnlIsEmpty ? (
        <section className="q-card q-empty-state">
          <h3>Este mes aún no tiene movimientos</h3>
          <p>Cuando haya ingresos o gastos aparecerá aquí el estado de resultados.</p>
        </section>
      ) : null}

      {!loadingPnl && pnlSummary && !pnlIsEmpty ? (
        <article className="q-card q-pnl-ticket">
          <div className="q-pnl-line">
            <span>INGRESOS (netos)</span>
            <strong className="q-mono">{formatMoney(pnlSummary.ingresos)}</strong>
          </div>
          <div className="q-pnl-divider" />
          <div className="q-pnl-line">
            <span>COSTO DE VENTA</span>
            <strong className="q-mono">{formatMoney(pnlSummary.costoVenta)}</strong>
          </div>
          <div className="q-pnl-divider" />
          <div className="q-pnl-line q-pnl-subtotal">
            <span>UTILIDAD BRUTA</span>
            <strong className="q-mono">{formatMoney(pnlSummary.utilidadBruta)}</strong>
          </div>
          <div className="q-pnl-divider" />
          <div className="q-pnl-line">
            <span>GASTOS OPERATIVOS</span>
            <strong className="q-mono">{formatMoney(pnlSummary.operativos)}</strong>
          </div>
          {pnlOperativeBreakdown.map((item) => (
            <div className="q-pnl-line q-pnl-line-indent" key={`op-${item.categoria}`}>
              <span>{item.categoria}</span>
              <strong className="q-mono">{formatMoney(item.total)}</strong>
            </div>
          ))}
          <div className="q-pnl-divider" />
          <div className="q-pnl-line">
            <span>FINANCIEROS</span>
            <strong className="q-mono">{formatMoney(pnlSummary.financieros)}</strong>
          </div>
          <div className="q-pnl-divider" />
          <div className={`q-pnl-final ${pnlSummary.utilidadOperativa >= 0 ? 'ok' : 'falt'}`}>
            <span>UTILIDAD OPERATIVA</span>
            <strong className="q-mono">{formatMoney(pnlSummary.utilidadOperativa)}</strong>
            <small className="q-mono">Margen: {(pnlSummary.margen * 100).toFixed(2)}%</small>
          </div>
        </article>
      ) : null}
    </section>
  )
  const renderEnvelopes = () => (
    <section className="q-shift-closings">
      <header className="q-section-header">
        <div>
          <h1>Sobres</h1>
          <p>Apartados digitales para obligaciones futuras.</p>
        </div>
        {canCreateEnvelope ? (
          <button
            className="q-btn q-btn-inline"
            type="button"
            onClick={() => {
              resetEnvelopeDraft()
              setShowEnvelopeForm((prev) => !prev)
            }}
          >
            {showEnvelopeForm ? 'Cerrar formulario' : 'Nuevo sobre'}
          </button>
        ) : null}
      </header>

      <article className="q-card q-envelope-strip">
        <div>
          <strong className="q-mono">Apartar hoy: {formatMoney(envelopesDailyTarget)}</strong>
          <span className="q-table-muted q-envelope-strip-sub">
            Efectivo disponible hoy: <strong className="q-mono">{formatMoney(envelopesAvailableCash)}</strong>
          </span>
        </div>
        {envelopesAvailableCash >= envelopesDailyTarget ? (
          <span className="q-chip ok">Te alcanza para apartar ✓</span>
        ) : (
          <span className="q-chip falt">Hoy no alcanza — faltan {formatMoney(envelopesCashGap)}</span>
        )}
      </article>

      {envelopesSuccess ? <p className="q-success-text">{envelopesSuccess}</p> : null}
      {envelopesError ? <p className="q-error-text">{envelopesError}</p> : null}

      {showEnvelopeForm ? (
        <form className="q-card q-envelope-form" onSubmit={handleCreateEnvelope}>
          <div className="q-field-grid-3">
            <label className="q-field">
              Nombre
              <input
                type="text"
                value={envelopeDraft.name}
                onChange={(event) => setEnvelopeDraft((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
            </label>
            <label className="q-field">
              Monto objetivo
              <input
                type="number"
                min={0}
                step="0.01"
                value={envelopeDraft.targetAmount}
                onChange={(event) =>
                  setEnvelopeDraft((prev) => ({ ...prev, targetAmount: asNumber(event.target.value) }))
                }
                required
              />
            </label>
            <label className="q-field">
              Frecuencia
              <select
                value={envelopeDraft.frequency}
                onChange={(event) =>
                  setEnvelopeDraft((prev) => ({
                    ...prev,
                    frequency: event.target.value as EnvelopeDraft['frequency'],
                  }))
                }
              >
                <option value="MONTHLY">Mensual</option>
                <option value="ONE_TIME">Única</option>
              </select>
            </label>
          </div>
          <div className="q-field-grid-3">
            {envelopeDraft.frequency === 'MONTHLY' ? (
              <label className="q-field">
                Día del mes
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={envelopeDraft.dueDay}
                  onChange={(event) =>
                    setEnvelopeDraft((prev) => ({ ...prev, dueDay: Math.max(1, asNumber(event.target.value)) }))
                  }
                />
              </label>
            ) : (
              <label className="q-field">
                Fecha
                <input
                  type="date"
                  value={envelopeDraft.dueDate}
                  onChange={(event) => setEnvelopeDraft((prev) => ({ ...prev, dueDate: event.target.value }))}
                />
              </label>
            )}
            <label className="q-field">
              Categoría
              <select
                value={envelopeDraft.categoryId}
                onChange={(event) => setEnvelopeDraft((prev) => ({ ...prev, categoryId: event.target.value }))}
              >
                <option value="">Sin categoría</option>
                {expenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="q-btn q-btn-inline" type="submit" disabled={savingEnvelope}>
            {savingEnvelope ? 'Guardando...' : 'Guardar sobre'}
          </button>
        </form>
      ) : null}

      {loadingEnvelopes ? <p>Cargando sobres...</p> : null}

      {!loadingEnvelopes && !envelopeItems.length ? (
        <section className="q-card q-empty-state">
          <h3>Digitaliza tus sobres</h3>
          <p>
            Digitaliza tus sobres — Quadre te dice cuánto apartar cada día para que la renta nunca te agarre en
            cero.
          </p>
        </section>
      ) : null}

      {!loadingEnvelopes && envelopeItems.length ? (
        <div className="q-envelope-grid">
          {envelopeItems.map((envelope) => {
            const target = asDecimal(envelope.targetAmount)
            const progress = target > 0 ? Math.min((envelope.saved / target) * 100, 100) : 0
            const depositDraft = depositDraftByEnvelope[envelope.id] || { amount: 0, note: '' }
            const payDraft = payDraftByEnvelope[envelope.id] || {
              locationId: selectedLocationId,
              date: getTodayDateInput(),
              amount: asDecimal(envelope.targetAmount),
              method: 'TRANSFERENCIA',
            }
            const withdrawDraft = withdrawDraftByEnvelope[envelope.id] || { amount: 0, reason: '' }
            const transferTargets = envelopeItems.filter((item) => item.id !== envelope.id)
            const transferDraft = transferDraftByEnvelope[envelope.id] || {
              toEnvelopeId: transferTargets[0]?.id || '',
              amount: 0,
              note: '',
            }
            return (
              <article className="q-card q-envelope-card" key={envelope.id}>
                <h3>{envelope.name}</h3>
                <div className="q-envelope-progress">
                  <div className="q-envelope-progress-bar" style={{ width: `${progress}%` }} />
                </div>
                <p className="q-envelope-meta q-mono">
                  {formatMoney(envelope.saved)} de {formatMoney(target)}
                </p>
                <p className="q-table-muted">
                  vence {formatDateFromIsoString(envelope.nextDue)} · faltan {envelope.daysLeft} días
                </p>
                <p className="q-envelope-daily">
                  Aparta <strong className="q-mono">{formatMoney(envelope.dailyNeeded)}/día</strong>
                </p>

                <div className="q-table-actions">
                  {canDepositEnvelope ? (
                    <button
                      type="button"
                      className="q-link-btn"
                      onClick={() =>
                        setActiveDepositEnvelopeId((prev) => (prev === envelope.id ? '' : envelope.id))
                      }
                    >
                      Abonar
                    </button>
                  ) : null}
                  {canPayEnvelope ? (
                    <button
                      type="button"
                      className="q-link-btn"
                      onClick={() => setActivePayEnvelopeId((prev) => (prev === envelope.id ? '' : envelope.id))}
                    >
                      Pagar
                    </button>
                  ) : null}
                  {canDepositEnvelope ? (
                    <button
                      type="button"
                      className="q-link-btn"
                      onClick={() =>
                        setActiveWithdrawEnvelopeId((prev) => (prev === envelope.id ? '' : envelope.id))
                      }
                    >
                      Retirar
                    </button>
                  ) : null}
                  {canDepositEnvelope ? (
                    <button
                      type="button"
                      className="q-link-btn"
                      onClick={() =>
                        setActiveTransferEnvelopeId((prev) => (prev === envelope.id ? '' : envelope.id))
                      }
                    >
                      Transferir
                    </button>
                  ) : null}
                  <button type="button" className="q-link-btn" onClick={() => handleOpenEnvelopeMovements(envelope.id)}>
                    Historial
                  </button>
                  {canCreateEnvelope ? (
                    <button
                      type="button"
                      className="q-link-btn q-link-danger"
                      disabled={savingEnvelope}
                      onClick={() => handleDeleteEnvelope(envelope.id, envelope.name)}
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>

                {activeDepositEnvelopeId === envelope.id ? (
                  <div className="q-envelope-mini-form">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Monto"
                      value={depositDraft.amount}
                      onChange={(event) =>
                        setDepositDraftByEnvelope((prev) => ({
                          ...prev,
                          [envelope.id]: { ...depositDraft, amount: asNumber(event.target.value) },
                        }))
                      }
                    />
                    <input
                      type="text"
                      placeholder="Nota (opcional)"
                      value={depositDraft.note}
                      onChange={(event) =>
                        setDepositDraftByEnvelope((prev) => ({
                          ...prev,
                          [envelope.id]: { ...depositDraft, note: event.target.value },
                        }))
                      }
                    />
                    <button className="q-btn q-btn-inline" type="button" onClick={() => handleDepositEnvelope(envelope.id)}>
                      Guardar abono
                    </button>
                  </div>
                ) : null}

                {activePayEnvelopeId === envelope.id ? (
                  <div className="q-envelope-mini-form">
                    <select
                      value={payDraft.locationId}
                      onChange={(event) =>
                        setPayDraftByEnvelope((prev) => ({
                          ...prev,
                          [envelope.id]: { ...payDraft, locationId: event.target.value },
                        }))
                      }
                    >
                      {(selectedBusiness?.locations || []).map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={payDraft.method}
                      onChange={(event) =>
                        setPayDraftByEnvelope((prev) => ({
                          ...prev,
                          [envelope.id]: {
                            ...payDraft,
                            method: event.target.value as EnvelopePayDraft['method'],
                          },
                        }))
                      }
                    >
                      <option value="EFECTIVO">EFECTIVO</option>
                      <option value="TARJETA">TARJETA</option>
                      <option value="TRANSFERENCIA">TRANSFERENCIA</option>
                      <option value="APP">APP</option>
                      <option value="OTRO">OTRO</option>
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={payDraft.amount}
                      onChange={(event) =>
                        setPayDraftByEnvelope((prev) => ({
                          ...prev,
                          [envelope.id]: { ...payDraft, amount: asNumber(event.target.value) },
                        }))
                      }
                    />
                    <button className="q-btn q-btn-inline" type="button" onClick={() => handlePayEnvelope(envelope)}>
                      Confirmar pago
                    </button>
                  </div>
                ) : null}

                {activeWithdrawEnvelopeId === envelope.id ? (
                  <div className="q-envelope-mini-form">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Monto a retirar"
                      value={withdrawDraft.amount}
                      onChange={(event) =>
                        setWithdrawDraftByEnvelope((prev) => ({
                          ...prev,
                          [envelope.id]: { ...withdrawDraft, amount: asNumber(event.target.value) },
                        }))
                      }
                    />
                    <input
                      type="text"
                      placeholder="Motivo (obligatorio)"
                      value={withdrawDraft.reason}
                      onChange={(event) =>
                        setWithdrawDraftByEnvelope((prev) => ({
                          ...prev,
                          [envelope.id]: { ...withdrawDraft, reason: event.target.value },
                        }))
                      }
                    />
                    <button className="q-btn q-btn-inline" type="button" onClick={() => handleWithdrawEnvelope(envelope)}>
                      Confirmar retiro
                    </button>
                  </div>
                ) : null}

                {activeTransferEnvelopeId === envelope.id ? (
                  <div className="q-envelope-mini-form">
                    <select
                      value={transferDraft.toEnvelopeId}
                      onChange={(event) =>
                        setTransferDraftByEnvelope((prev) => ({
                          ...prev,
                          [envelope.id]: { ...transferDraft, toEnvelopeId: event.target.value },
                        }))
                      }
                    >
                      {transferTargets.length ? null : <option value="">No hay otro sobre disponible</option>}
                      {transferTargets.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Monto a transferir"
                      value={transferDraft.amount}
                      onChange={(event) =>
                        setTransferDraftByEnvelope((prev) => ({
                          ...prev,
                          [envelope.id]: { ...transferDraft, amount: asNumber(event.target.value) },
                        }))
                      }
                    />
                    <input
                      type="text"
                      placeholder="Nota (opcional)"
                      value={transferDraft.note}
                      onChange={(event) =>
                        setTransferDraftByEnvelope((prev) => ({
                          ...prev,
                          [envelope.id]: { ...transferDraft, note: event.target.value },
                        }))
                      }
                    />
                    <button className="q-btn q-btn-inline" type="button" onClick={() => handleTransferEnvelope(envelope.id)}>
                      Confirmar transferencia
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : null}
      {activeMovementsEnvelopeId ? (
        <div className="q-modal-overlay" role="presentation" onClick={() => setActiveMovementsEnvelopeId('')}>
          <div className="q-modal-card q-envelope-movements-modal" role="dialog" onClick={(event) => event.stopPropagation()}>
            <div className="q-close-form-header">
              <h2>Movimientos · {activeMovementEnvelopeName}</h2>
              <button type="button" className="q-link-btn" onClick={() => setActiveMovementsEnvelopeId('')}>
                Cerrar
              </button>
            </div>
            {loadingEnvelopeMovements ? <p>Cargando movimientos...</p> : null}
            {!loadingEnvelopeMovements && !activeEnvelopeMovements.length ? (
              <p className="q-table-muted">Aún no hay movimientos en este sobre.</p>
            ) : null}
            {!loadingEnvelopeMovements && activeEnvelopeMovements.length ? (
              <div className="q-envelope-movements-list">
                {activeEnvelopeMovements.map((movement) => {
                  const signedAmount = getEnvelopeMovementSignedAmount(movement)
                  const note = movement.reason?.trim() || movement.note?.trim() || ''
                  return (
                    <article className="q-envelope-movement-row" key={movement.id}>
                      <div className="q-envelope-movement-main">
                        <strong>{formatEnvelopeMovementType(movement.type)}</strong>
                        <span className="q-table-muted">{formatDateFromIsoString(movement.date)}</span>
                        {note ? <p className="q-envelope-movement-note">{note}</p> : null}
                      </div>
                      <strong className={`q-mono q-envelope-movement-amount ${signedAmount >= 0 ? 'ok' : 'falt'}`}>
                        {signedAmount >= 0 ? '+' : '-'}
                        {formatMoney(Math.abs(signedAmount))}
                      </strong>
                    </article>
                  )
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
  const renderTeam = () => (
    <section className="q-shift-closings">
      <header className="q-section-header">
        <div>
          <h1>Equipo</h1>
          <p>{teamMembers.length} miembros</p>
        </div>
        <button
          className="q-btn q-btn-inline"
          type="button"
          onClick={() => {
            resetMemberForm()
            setShowAddMemberForm((prev) => !prev)
          }}
        >
          Agregar miembro
        </button>
      </header>

      {showAddMemberForm ? (
        <form className="q-card q-team-form" onSubmit={handleCreateMember}>
          <div className="q-field-grid-2">
            <label className="q-field">
              Nombre
              <input
                type="text"
                required
                value={memberForm.name}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>
            <label className="q-field">
              Email
              <input
                type="email"
                required
                value={memberForm.email}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>
          </div>
          <div className="q-field-grid-3">
            <label className="q-field">
              Password temporal
              <input
                type="password"
                required
                minLength={8}
                value={memberForm.password}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </label>
            <label className="q-field">
              Rol
              <select
                value={memberForm.role}
                onChange={(event) =>
                  setMemberForm((prev) => ({
                    ...prev,
                    role: event.target.value as 'ADMIN' | 'MANAGER' | 'STAFF',
                  }))
                }
              >
                <option value="ADMIN">Administrador</option>
                <option value="MANAGER">Gerente</option>
                <option value="STAFF">Staff</option>
              </select>
            </label>
            <label className="q-field">
              Sucursal
              <select
                value={memberForm.locationId}
                onChange={(event) => setMemberForm((prev) => ({ ...prev, locationId: event.target.value }))}
              >
                <option value="ALL">Todas las sucursales</option>
                {(selectedBusiness?.locations || []).map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {addMemberError ? <p className="q-error-text">{addMemberError}</p> : null}
          <button className="q-btn q-btn-inline" type="submit" disabled={savingMember}>
            {savingMember ? 'Guardando...' : 'Guardar miembro'}
          </button>
        </form>
      ) : null}

      {loadingTeam ? <p>Cargando equipo...</p> : null}
      {teamError ? <p className="q-error-text">{teamError}</p> : null}

      {!loadingTeam && !teamError && !teamMembers.length ? (
        <section className="q-card q-empty-state">
          <h3>Aún no hay miembros registrados</h3>
          <p>Agrega al primer miembro para comenzar a colaborar.</p>
        </section>
      ) : null}

      {!loadingTeam && !teamError && teamMembers.length ? (
        <div className="q-table-wrap">
          <table className="q-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Sucursal</th>
              </tr>
            </thead>
            <tbody>
              {teamMembers.map((member) => (
                <tr key={member.id}>
                  <td>{member.name}</td>
                  <td>{member.email}</td>
                  <td>{formatTeamRole(member.role)}</td>
                  <td>{member.locationName || 'Todas'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )

  async function handleCreateMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || !selectedBusinessId) return
    setSavingMember(true)
    setAddMemberError('')
    try {
      await createBusinessMember({
        token,
        businessId: selectedBusinessId,
        payload: {
          name: memberForm.name,
          email: memberForm.email,
          password: memberForm.password,
          role: memberForm.role,
          locationId: memberForm.locationId === 'ALL' ? null : memberForm.locationId,
        },
      })
      await refreshTeamMembers()
      resetMemberForm()
      setShowAddMemberForm(false)
    } catch (error) {
      setAddMemberError(error instanceof Error ? error.message : 'No se pudo crear el miembro')
    } finally {
      setSavingMember(false)
    }
  }
  const renderWaitlist = () => (
    <section className="q-shift-closings">
      <header className="q-section-header">
        <div>
          <h1>Waitlist</h1>
          <p>{waitlistLeads.length} registrados</p>
        </div>
      </header>

      {loadingWaitlist ? <p>Cargando waitlist...</p> : null}
      {waitlistError ? <p className="q-error-text">{waitlistError}</p> : null}

      {!loadingWaitlist && !waitlistError && !waitlistLeads.length ? (
        <section className="q-card q-empty-state">
          <h3>Aún no hay registros en la waitlist</h3>
          <p>Cuando lleguen desde la landing aparecerán aquí.</p>
        </section>
      ) : null}

      {!loadingWaitlist && !waitlistError && waitlistLeads.length ? (
        <div className="q-table-wrap">
          <table className="q-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Contacto</th>
                <th>Fuente</th>
                <th>Registro</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {waitlistLeads.map((lead) => {
                const whatsappUrl = buildWhatsappUrl(lead)
                return (
                  <tr key={lead.id}>
                    <td>
                      <div className="q-table-turn">
                        <strong>{lead.name}</strong>
                        <span>
                          {lead.businessName || '—'} · {lead.businessType || '—'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="q-table-turn">
                        <strong>{lead.email}</strong>
                        <span>{lead.whatsapp || 'Sin WhatsApp'}</span>
                      </div>
                    </td>
                    <td>{lead.source || 'direct'}</td>
                    <td>{formatDateFromIsoString(lead.createdAt)}</td>
                    <td>
                      {whatsappUrl ? (
                        <a
                          className="q-chip-btn q-chip-btn-link"
                          href={whatsappUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          WhatsApp
                        </a>
                      ) : (
                        <span className="q-table-muted">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  )

  return (
    <>
      <header className="q-topbar">
        <div className="q-topbar-left">
          <button
            type="button"
            className="q-topbar-menu-btn"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <img src="/logo.png" alt="Quadre" />
        </div>
        <button className="q-btn" type="button" onClick={logout} style={{ width: 'auto' }}>
          Salir
        </button>
      </header>

      <div
        className={`q-drawer-overlay ${isMobileMenuOpen ? 'open' : ''}`}
        onClick={() => setIsMobileMenuOpen(false)}
      />
      <aside className={`q-mobile-drawer ${isMobileMenuOpen ? 'open' : ''}`} aria-hidden={!isMobileMenuOpen}>
        <button
          type="button"
          className="q-drawer-close-btn"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-label="Cerrar menú"
        >
          ✕
        </button>
        {renderSidebarContent()}
      </aside>

      <main className="q-app-shell">
        <aside className="q-sidebar">{renderSidebarContent()}</aside>

        <section className="q-main">
          {loadingUser ? <p>Cargando sesión...</p> : null}
          {!loadingUser && activeItem === 'Dashboard' ? (
            <section className="q-dashboard">
              <h1>Hola, {user?.name || 'equipo'}.</h1>
              {loadingDashboard ? <p>Cargando dashboard...</p> : null}
              {!loadingDashboard && dashboardError ? <p className="q-error-text">{dashboardError}</p> : null}
              {!loadingDashboard && !dashboardError && dashboardSummary?.mes.cierres === 0 ? (
                <section className="q-card q-empty-state">
                  <h3>Sin cierres todavía</h3>
                  <p>Cierra tu primer turno para empezar a ver métricas.</p>
                  <button className="q-link-btn" type="button" onClick={() => setActiveItem('Cierres de turno')}>
                    Ir a Cierres
                  </button>
                </section>
              ) : null}
              {!loadingDashboard && !dashboardError && dashboardSummary ? (
                <div className="q-cards">
                  <article className="q-card">
                    <h3>Ventas netas hoy</h3>
                    <div className="value q-mono">{formatMoney(dashboardSummary.hoy.ventasNetas)}</div>
                  </article>
                  <article className="q-card">
                    <h3>Faltantes del día</h3>
                    <div
                      className={`value q-mono ${
                        dashboardSummary.hoy.faltantes < 0 ? 'q-value-negative' : ''
                      }`}
                    >
                      {formatMoney(dashboardSummary.hoy.faltantes)}
                    </div>
                    <span className={`q-chip ${dashboardSummary.hoy.faltantes < 0 ? 'falt' : 'ok'}`}>
                      {dashboardSummary.hoy.faltantes < 0 ? 'Faltante' : 'Sin faltantes'}
                    </span>
                  </article>
                  <article className="q-card">
                    <h3>Ventas del mes</h3>
                    <div className="value q-mono">{formatMoney(dashboardSummary.mes.ventasNetas)}</div>
                  </article>
                  <article className="q-card">
                    <h3>Cierres del mes</h3>
                    <div className="value q-mono">{dashboardSummary.mes.cierres}</div>
                  </article>
                </div>
              ) : null}
            </section>
          ) : null}

          {!loadingUser && activeItem === 'Cierres de turno' ? renderShiftClosings() : null}
          {!loadingUser && activeItem === 'Requisiciones' ? renderRequisitions() : null}
          {!loadingUser && activeItem === 'Proveedores y adeudos' ? renderPayables() : null}
          {!loadingUser && activeItem === 'Gastos' ? renderExpenses() : null}
          {!loadingUser && activeItem === 'Sobres' ? renderEnvelopes() : null}
          {!loadingUser && activeItem === 'P&L y reportes' ? renderPnl() : null}
          {!loadingUser && activeItem === 'Equipo' ? renderTeam() : null}
          {!loadingUser && activeItem === 'Waitlist' ? renderWaitlist() : null}

          {!loadingUser &&
          activeItem !== 'Dashboard' &&
          activeItem !== 'Cierres de turno' &&
          activeItem !== 'Requisiciones' &&
          activeItem !== 'Proveedores y adeudos' &&
          activeItem !== 'Gastos' &&
          activeItem !== 'Sobres' &&
          activeItem !== 'P&L y reportes' &&
          activeItem !== 'Equipo' &&
          activeItem !== 'Waitlist' ? (
            <p>
              Módulo <strong>{activeItem}</strong> visible en el shell. Se implementa funcionalidad en los
              siguientes bloques.
            </p>
          ) : null}
        </section>
      </main>

      {summaryPreview ? (
        <div className="q-modal-overlay" onClick={() => setSummaryPreview(null)}>
          <section className="q-modal-card q-requisition-summary-modal" onClick={(event) => event.stopPropagation()}>
            <div className="q-close-form-header">
              <h2>Resumen de pedido</h2>
              <button type="button" className="q-link-btn" onClick={() => setSummaryPreview(null)}>
                Cerrar
              </button>
            </div>
            <img src={summaryPreview.url} alt="Resumen de requisiciones" className="q-requisition-summary-image" />
            <div className="q-table-actions">
              <button type="button" className="q-btn q-btn-inline" onClick={downloadSummaryImage}>
                Descargar
              </button>
              <button type="button" className="q-btn q-btn-inline" onClick={() => void shareSummaryImage()}>
                Compartir
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
