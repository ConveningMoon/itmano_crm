import type { Tenant, Agent, LeadSource, Lead, Language } from './types'

export const MOCK_TENANT: Tenant = {
  id: 'aj-real-estate',
  name: 'A&J Real Estate Group',
  slug: 'aj-real-estate',
  primaryColor: '#1E3A5F',
}

export const MOCK_AGENTS: Agent[] = [
  {
    id: 'agent-adriana',
    tenantId: 'aj-real-estate',
    name: 'Adriana Melendez',
    email: 'adriana.demo@example.com',
    phone: '(757) 555-0101',
    language: 'es',
    specialty: 'hispanic',
    avatarInitials: 'AM',
    accentColor: '#5B8EC9',
    active: true,
  },
  {
    id: 'agent-john',
    tenantId: 'aj-real-estate',
    name: 'John Leonard',
    email: 'john.demo@example.com',
    phone: '(757) 555-0102',
    language: 'en',
    specialty: 'military',
    avatarInitials: 'JL',
    accentColor: '#5AAFA0',
    active: true,
  },
  {
    id: 'agent-melanie',
    tenantId: 'aj-real-estate',
    name: 'Melanie Valencia',
    email: 'melanie.demo@example.com',
    phone: '(757) 555-0103',
    language: 'es',
    specialty: 'first_buyer',
    avatarInitials: 'MV',
    accentColor: '#C97B6B',
    active: true,
  },
  {
    id: 'agent-viviane',
    tenantId: 'aj-real-estate',
    name: 'Viviane Chiu',
    email: 'viviane.demo@example.com',
    phone: '(757) 555-0104',
    language: 'pt',
    specialty: 'brazilian',
    avatarInitials: 'VC',
    accentColor: '#B87BA3',
    active: true,
  },
]

export const MOCK_SOURCES: LeadSource[] = [
  { id: 'src-lm-adriana', tenantId: 'aj-real-estate', name: 'Guía Familias Hispanas', type: 'lead_magnet' },
  { id: 'src-lm-john', tenantId: 'aj-real-estate', name: 'VA Loan Playbook', type: 'lead_magnet' },
  { id: 'src-lm-melanie', tenantId: 'aj-real-estate', name: 'Guía Compradores Primerizos', type: 'lead_magnet' },
  { id: 'src-lm-viviane', tenantId: 'aj-real-estate', name: 'Guia Compradores Brasileiros', type: 'lead_magnet' },
  { id: 'src-web', tenantId: 'aj-real-estate', name: 'Formulario Web', type: 'web_form' },
  { id: 'src-manual', tenantId: 'aj-real-estate', name: 'Registro Manual', type: 'manual' },
  { id: 'src-openhouse', tenantId: 'aj-real-estate', name: 'Open House', type: 'open_house' },
]

export const MOCK_LEADS: Lead[] = [
  // --- ADRIANA: Familias hispanas (25 leads) ---
  { id: 'l-001', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Juan', lastName: 'Lopez', email: 'lead+001@example.invalid', phone: '', language: 'es', status: 'nurturing', temperatureScore: 35, notes: '', createdAt: '2026-01-19T12:48:00Z', updatedAt: '2026-01-19T12:48:00Z' },
  { id: 'l-002', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Antoinette', lastName: 'Nunez', email: 'lead+002@example.invalid', phone: '(757) 555-1002', language: 'es', status: 'warm', temperatureScore: 58, notes: 'Familia de 4, buscan 3 habitaciones', createdAt: '2025-10-11T15:20:00Z', updatedAt: '2025-11-02T10:00:00Z' },
  { id: 'l-003', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Mildred', lastName: 'Rodriguez-Jaquez', email: 'lead+003@example.invalid', phone: '(757) 555-1003', language: 'es', status: 'hot', temperatureScore: 78, notes: 'Muy interesada, consulta agendada', createdAt: '2025-10-07T16:38:00Z', updatedAt: '2025-11-15T09:00:00Z' },
  { id: 'l-004', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Sergio', lastName: 'Vargas', email: 'lead+004@example.invalid', phone: '(757) 555-1004', language: 'es', status: 'nurturing', temperatureScore: 28, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-005', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Norelys', lastName: 'Diaz', email: 'lead+005@example.invalid', phone: '(757) 555-1005', language: 'es', status: 'process_started', temperatureScore: 92, notes: 'Pre-aprobada, buscando en Virginia Beach', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-01-10T08:00:00Z' },
  { id: 'l-006', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Belkin', lastName: 'Rivera', email: 'lead+006@example.invalid', phone: '(757) 555-1006', language: 'es', status: 'new', temperatureScore: 10, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-007', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Rosmery', lastName: 'Davila', email: 'lead+007@example.invalid', phone: '(757) 555-1007', language: 'es', status: 'warm', temperatureScore: 55, notes: 'Quiere comprar en 6 meses', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-12-01T11:00:00Z' },
  { id: 'l-008', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Taina', lastName: 'De La O Henriquez', email: 'lead+008@example.invalid', phone: '(757) 555-1008', language: 'es', status: 'nurturing', temperatureScore: 32, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-009', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Elena', lastName: 'Maldonado', email: 'lead+009@example.invalid', phone: '(757) 555-1009', language: 'es', status: 'closed', temperatureScore: 100, notes: 'Cerró en Norfolk. $285K. VA Beach.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-02-15T14:00:00Z' },
  { id: 'l-010', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Yessica', lastName: 'Rojas', email: 'lead+010@example.invalid', phone: '(757) 555-1010', language: 'es', status: 'nurturing', temperatureScore: 22, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-011', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Amor', lastName: 'Juarez', email: 'lead+011@example.invalid', phone: '(757) 555-1011', language: 'es', status: 'hot', temperatureScore: 82, notes: 'Lista para comprar. Presupuesto $320K', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-01-20T09:00:00Z' },
  { id: 'l-012', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Milagro', lastName: 'Molina', email: 'lead+012@example.invalid', phone: '(757) 555-1012', language: 'es', status: 'new', temperatureScore: 8, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-013', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-web', firstName: 'Manuel', lastName: 'Campos', email: 'lead+013@example.invalid', phone: '(757) 555-1013', language: 'es', status: 'nurturing', temperatureScore: 30, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-014', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Gloria', lastName: 'Gonzalez', email: 'lead+014@example.invalid', phone: '(757) 555-1014', language: 'es', status: 'process_completed', temperatureScore: 100, notes: 'Proceso completado. Casa en Chesapeake.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-03-01T16:00:00Z' },
  { id: 'l-015', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-manual', firstName: 'Guadalupe', lastName: 'Martinez', email: 'lead+015@example.invalid', phone: '(757) 555-1015', language: 'es', status: 'warm', temperatureScore: 62, notes: 'Referida por Elena Maldonado', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-12-10T10:00:00Z' },
  { id: 'l-016', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Carmen', lastName: 'Asto', email: 'lead+016@example.invalid', phone: '(757) 555-1016', language: 'es', status: 'new', temperatureScore: 12, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-017', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Daisy', lastName: 'Aragon', email: 'lead+017@example.invalid', phone: '(757) 555-1017', language: 'es', status: 'lost', temperatureScore: 5, notes: 'Ya compró con otra agencia', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-12-20T08:00:00Z' },
  { id: 'l-018', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Sony', lastName: 'Campos', email: 'lead+018@example.invalid', phone: '(757) 555-1018', language: 'es', status: 'nurturing', temperatureScore: 40, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-11-01T10:00:00Z' },
  { id: 'l-019', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Cristina', lastName: 'Nazzario', email: 'lead+019@example.invalid', phone: '(757) 555-1019', language: 'es', status: 'hot', temperatureScore: 75, notes: 'Agendó consulta para el próximo lunes', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-02-01T11:00:00Z' },
  { id: 'l-020', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-openhouse', firstName: 'Edwuin', lastName: 'Franco', email: 'lead+020@example.invalid', phone: '(757) 555-1020', language: 'es', status: 'new', temperatureScore: 15, notes: 'Vino al open house de Norfolk', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-021', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Armando', lastName: 'Romero', email: 'lead+021@example.invalid', phone: '(757) 555-1021', language: 'es', status: 'process_started', temperatureScore: 88, notes: 'Oferta aceptada. Cierre estimado mayo.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-04-01T09:00:00Z' },
  { id: 'l-022', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Edwin', lastName: 'DiazCruz', email: 'lead+022@example.invalid', phone: '', language: 'es', status: 'nurturing', temperatureScore: 25, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-023', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Rosmary', lastName: 'Cardona', email: 'lead+023@example.invalid', phone: '(757) 555-1023', language: 'es', status: 'warm', temperatureScore: 50, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-11-20T10:00:00Z' },
  { id: 'l-024', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-web', firstName: 'Yadira', lastName: 'Vega', email: 'lead+024@example.invalid', phone: '(757) 555-1024', language: 'es', status: 'new', temperatureScore: 10, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-025', tenantId: 'aj-real-estate', agentId: 'agent-adriana', sourceId: 'src-lm-adriana', firstName: 'Emilson', lastName: 'Alvarez', email: 'lead+025@example.invalid', phone: '(757) 555-1025', language: 'es', status: 'new', temperatureScore: 8, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },

  // --- JOHN: Familias militares (20 leads) ---
  { id: 'l-026', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Greg', lastName: 'Ducker', email: 'lead+026@example.invalid', phone: '(757) 555-1026', language: 'en', status: 'process_started', temperatureScore: 91, notes: 'Navy, PCS desde San Diego. VA Loan aprobado $410K', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-03-15T10:00:00Z' },
  { id: 'l-027', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Steve', lastName: 'Braithwaite', email: 'lead+027@example.invalid', phone: '(757) 555-1027', language: 'en', status: 'warm', temperatureScore: 60, notes: 'PCS en julio, empezando a buscar', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-12-15T10:00:00Z' },
  { id: 'l-028', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Mckenna', lastName: 'West', email: 'lead+028@example.invalid', phone: '(757) 555-1028', language: 'en', status: 'nurturing', temperatureScore: 38, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-029', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Arth', lastName: 'Ecleo', email: 'lead+029@example.invalid', phone: '(757) 555-1029', language: 'en', status: 'hot', temperatureScore: 80, notes: 'Listo para hacer oferta. Little Creek area.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-01-25T11:00:00Z' },
  { id: 'l-030', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Patsy', lastName: 'Garcia', email: 'lead+030@example.invalid', phone: '(757) 555-1030', language: 'en', status: 'new', temperatureScore: 12, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-031', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Hines', lastName: 'Nqhaii', email: 'lead+031@example.invalid', phone: '', language: 'en', status: 'closed', temperatureScore: 100, notes: 'Cerró $395K. VA Loan. Zona Oceana.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-02-28T16:00:00Z' },
  { id: 'l-032', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'George', lastName: 'Williams', email: 'lead+032@example.invalid', phone: '', language: 'en', status: 'nurturing', temperatureScore: 30, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-033', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Skye', lastName: 'Talley', email: 'lead+033@example.invalid', phone: '(757) 555-1033', language: 'en', status: 'warm', temperatureScore: 52, notes: 'Esposa de militar, PCS en agosto', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-12-20T10:00:00Z' },
  { id: 'l-034', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-web', firstName: 'Ronald', lastName: 'Hernandez', email: 'lead+034@example.invalid', phone: '(757) 555-1034', language: 'en', status: 'new', temperatureScore: 10, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-035', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Sam', lastName: 'S', email: 'lead+035@example.invalid', phone: '(757) 555-1035', language: 'en', status: 'process_started', temperatureScore: 87, notes: 'En proceso. VA Loan. Zona Norfolk Naval Station.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-03-20T08:00:00Z' },
  { id: 'l-036', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Osmar', lastName: 'Araujo', email: 'lead+036@example.invalid', phone: '(757) 555-1036', language: 'en', status: 'nurturing', temperatureScore: 35, notes: '', createdAt: '2025-10-07T15:44:00Z', updatedAt: '2025-10-07T15:44:00Z' },
  { id: 'l-037', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Rafael', lastName: 'Ramirez', email: 'lead+037@example.invalid', phone: '(757) 555-1037', language: 'en', status: 'new', temperatureScore: 8, notes: '', createdAt: '2025-10-07T15:44:00Z', updatedAt: '2025-10-07T15:44:00Z' },
  { id: 'l-038', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-manual', firstName: 'Marco', lastName: 'Trujillo', email: 'lead+038@example.invalid', phone: '(757) 555-1038', language: 'en', status: 'warm', temperatureScore: 65, notes: 'Referido por Greg Ducker. Navy.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-01-05T11:00:00Z' },
  { id: 'l-039', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Kevin', lastName: 'Padilla', email: 'lead+039@example.invalid', phone: '(757) 555-1039', language: 'en', status: 'hot', temperatureScore: 77, notes: 'Marine, PCS en junio. Pre-aprobado.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-02-10T10:00:00Z' },
  { id: 'l-040', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Ranielle', lastName: 'Fungo', email: 'lead+040@example.invalid', phone: '(757) 555-1040', language: 'en', status: 'new', temperatureScore: 10, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-041', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-openhouse', firstName: 'Wilson', lastName: 'Arriola', email: 'lead+041@example.invalid', phone: '(757) 555-1041', language: 'en', status: 'nurturing', temperatureScore: 28, notes: 'Open house Virginia Beach', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-11-01T10:00:00Z' },
  { id: 'l-042', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Camila', lastName: 'Ortiz', email: 'lead+042@example.invalid', phone: '(757) 555-1042', language: 'en', status: 'lost', temperatureScore: 5, notes: 'PCS cancelado, se queda en su base actual', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-12-15T09:00:00Z' },
  { id: 'l-043', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Arnoldo', lastName: 'Vazquez', email: 'lead+043@example.invalid', phone: '(757) 555-1043', language: 'en', status: 'process_completed', temperatureScore: 100, notes: 'Proceso completado. Norfolk. $370K VA Loan.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-01-30T15:00:00Z' },
  { id: 'l-044', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-lm-john', firstName: 'Emanuel', lastName: 'Alvarez', email: 'lead+044@example.invalid', phone: '(757) 555-1044', language: 'en', status: 'nurturing', temperatureScore: 42, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-11-10T10:00:00Z' },
  { id: 'l-045', tenantId: 'aj-real-estate', agentId: 'agent-john', sourceId: 'src-web', firstName: 'Charly', lastName: 'Pinzon', email: 'lead+045@example.invalid', phone: '(757) 555-1045', language: 'en', status: 'new', temperatureScore: 10, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },

  // --- MELANIE: Compradores primerizos (15 leads) ---
  { id: 'l-046', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-lm-melanie', firstName: 'Jasmyne', lastName: 'Carrillo', email: 'lead+046@example.invalid', phone: '(757) 555-1046', language: 'es', status: 'hot', temperatureScore: 83, notes: 'Primera compra. Consulta agendada viernes.', createdAt: '2025-11-11T10:00:00Z', updatedAt: '2026-02-05T11:00:00Z' },
  { id: 'l-047', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-lm-melanie', firstName: 'Pablo', lastName: 'Linares', email: 'lead+047@example.invalid', phone: '(757) 555-1047', language: 'es', status: 'nurturing', temperatureScore: 38, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-048', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-lm-melanie', firstName: 'Monse', lastName: 'VanVolkenburg', email: 'lead+048@example.invalid', phone: '(757) 555-1048', language: 'es', status: 'warm', temperatureScore: 55, notes: 'Pareja joven, presupuesto $280K', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-12-01T10:00:00Z' },
  { id: 'l-049', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-lm-melanie', firstName: 'Blanca Lissette', lastName: 'Campos Flores', email: 'lead+049@example.invalid', phone: '(757) 555-1049', language: 'es', status: 'process_started', temperatureScore: 90, notes: 'En proceso. Primera compra $265K. FHA Loan.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-03-10T09:00:00Z' },
  { id: 'l-050', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-lm-melanie', firstName: 'Karen', lastName: 'Garcia', email: 'lead+050@example.invalid', phone: '(757) 555-1050', language: 'es', status: 'new', temperatureScore: 12, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-051', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-lm-melanie', firstName: 'Noelia', lastName: 'Garcia', email: 'lead+051@example.invalid', phone: '(757) 555-1051', language: 'es', status: 'nurturing', temperatureScore: 30, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-052', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-lm-melanie', firstName: 'Dayron', lastName: '', email: 'lead+052@example.invalid', phone: '(757) 555-1052', language: 'es', status: 'warm', temperatureScore: 60, notes: 'Primer comprador. Muy motivado.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-12-20T11:00:00Z' },
  { id: 'l-053', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-web', firstName: 'Johanna Leon', lastName: '', email: 'lead+053@example.invalid', phone: '', language: 'es', status: 'new', temperatureScore: 8, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-054', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-lm-melanie', firstName: 'Claudia', lastName: '', email: 'lead+054@example.invalid', phone: '(757) 555-1054', language: 'es', status: 'hot', temperatureScore: 72, notes: 'Consulta la próxima semana', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-01-28T10:00:00Z' },
  { id: 'l-055', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-lm-melanie', firstName: 'Abigail', lastName: 'Calito', email: 'lead+055@example.invalid', phone: '(757) 555-1055', language: 'es', status: 'process_completed', temperatureScore: 100, notes: 'Cerró. $255K. FHA. Primera casa. Virginia Beach.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-02-20T14:00:00Z' },
  { id: 'l-056', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-lm-melanie', firstName: 'Sandra', lastName: 'Portillo', email: 'lead+056@example.invalid', phone: '(757) 555-1056', language: 'es', status: 'nurturing', temperatureScore: 35, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-057', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-manual', firstName: 'Shantal', lastName: 'Torres', email: 'lead+057@example.invalid', phone: '(757) 555-1057', language: 'es', status: 'new', temperatureScore: 10, notes: 'Registrada manualmente por Adriana', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-058', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-lm-melanie', firstName: 'Sofia', lastName: '', email: 'lead+058@example.invalid', phone: '(757) 555-1058', language: 'es', status: 'closed', temperatureScore: 100, notes: 'Cerró $245K. Chesapeake. Primera compra.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-03-05T15:00:00Z' },
  { id: 'l-059', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-lm-melanie', firstName: 'Geovanny', lastName: 'Sandoval', email: 'lead+059@example.invalid', phone: '(757) 555-1059', language: 'es', status: 'nurturing', temperatureScore: 28, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-060', tenantId: 'aj-real-estate', agentId: 'agent-melanie', sourceId: 'src-web', firstName: 'Yesica', lastName: 'Delgado', email: 'lead+060@example.invalid', phone: '', language: 'es', status: 'new', temperatureScore: 8, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },

  // --- VIVIANE: Comunidad brasileña/portuguesa (15 leads) ---
  { id: 'l-061', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-lm-viviane', firstName: 'Melisa', lastName: 'Sandoval Rivera', email: 'lead+061@example.invalid', phone: '(757) 555-1061', language: 'pt', status: 'hot', temperatureScore: 79, notes: 'Família brasileira. Quer comprar antes de julho.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-02-08T10:00:00Z' },
  { id: 'l-062', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-lm-viviane', firstName: 'Anibal', lastName: 'Marroquin Mejia', email: 'lead+062@example.invalid', phone: '(757) 555-1062', language: 'pt', status: 'nurturing', temperatureScore: 32, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-063', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-lm-viviane', firstName: 'Juana', lastName: 'Garcia', email: 'lead+063@example.invalid', phone: '(757) 555-1063', language: 'pt', status: 'warm', temperatureScore: 57, notes: 'ITIN mortgage, precisa de ajuda com documentação', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-12-05T10:00:00Z' },
  { id: 'l-064', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-lm-viviane', firstName: 'Jobany', lastName: 'Correa', email: 'lead+064@example.invalid', phone: '(757) 555-1064', language: 'pt', status: 'process_started', temperatureScore: 93, notes: 'Em processo. $310K. Família brasileira. Convencional.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-04-05T09:00:00Z' },
  { id: 'l-065', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-lm-viviane', firstName: 'Miguel', lastName: 'Duarte', email: 'lead+065@example.invalid', phone: '(757) 555-1065', language: 'pt', status: 'new', temperatureScore: 12, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-066', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-lm-viviane', firstName: 'Evelyn', lastName: '', email: 'lead+066@example.invalid', phone: '(757) 555-1066', language: 'pt', status: 'nurturing', temperatureScore: 40, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-11-01T10:00:00Z' },
  { id: 'l-067', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-lm-viviane', firstName: 'Jhonmer', lastName: 'Oineda', email: 'lead+067@example.invalid', phone: '(757) 555-1067', language: 'pt', status: 'closed', temperatureScore: 100, notes: 'Fechou $295K. Família brasileira. Virginia Beach.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-02-10T16:00:00Z' },
  { id: 'l-068', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-web', firstName: 'Baudilio', lastName: 'Veliz', email: 'lead+068@example.invalid', phone: '(757) 555-1068', language: 'pt', status: 'new', temperatureScore: 8, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-069', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-lm-viviane', firstName: 'Jorge', lastName: 'Segundo', email: 'lead+069@example.invalid', phone: '(757) 555-1069', language: 'pt', status: 'warm', temperatureScore: 62, notes: 'Investidor brasileiro. Procura property até $350K.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-01-15T10:00:00Z' },
  { id: 'l-070', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-lm-viviane', firstName: 'Sara', lastName: 'Maldonado', email: 'lead+070@example.invalid', phone: '(757) 555-1070', language: 'pt', status: 'hot', temperatureScore: 76, notes: 'Consulta agendada. ITIN loan.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-02-20T11:00:00Z' },
  { id: 'l-071', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-lm-viviane', firstName: 'Ivan', lastName: '', email: 'lead+071@example.invalid', phone: '(757) 555-1071', language: 'pt', status: 'nurturing', temperatureScore: 25, notes: '', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-072', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-manual', firstName: 'Yabrielis', lastName: '', email: 'lead+072@example.invalid', phone: '(757) 555-1072', language: 'pt', status: 'new', temperatureScore: 10, notes: 'Registrado manualmente', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-073', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-lm-viviane', firstName: 'Marc', lastName: '', email: 'lead+073@example.invalid', phone: '(757) 555-1073', language: 'pt', status: 'process_completed', temperatureScore: 100, notes: 'Processo concluído. $275K. Chesapeake.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2026-01-20T15:00:00Z' },
  { id: 'l-074', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-openhouse', firstName: 'Ingrid', lastName: 'Mujia', email: 'lead+074@example.invalid', phone: '(757) 555-1074', language: 'pt', status: 'new', temperatureScore: 10, notes: 'Open house. Família brasileira.', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-10-07T16:10:00Z' },
  { id: 'l-075', tenantId: 'aj-real-estate', agentId: 'agent-viviane', sourceId: 'src-lm-viviane', firstName: 'Emmanuel', lastName: 'Vazquez', email: 'lead+075@example.invalid', phone: '(757) 555-1075', language: 'pt', status: 'lost', temperatureScore: 3, notes: 'Decidiu não comprar por ora', createdAt: '2025-10-07T16:10:00Z', updatedAt: '2025-12-01T10:00:00Z' },
]

export function getAgentById(id: string): Agent | undefined {
  return MOCK_AGENTS.find(a => a.id === id)
}

export function getSourceById(id: string): LeadSource | undefined {
  return MOCK_SOURCES.find(s => s.id === id)
}

export function getLeadsByAgent(agentId: string): Lead[] {
  return MOCK_LEADS.filter(l => l.agentId === agentId)
}

export function getLeadsByStatus(status: string): Lead[] {
  return MOCK_LEADS.filter(l => l.status === status)
}

export function getLeadsStats() {
  const total = MOCK_LEADS.length
  const hot = MOCK_LEADS.filter(l => l.status === 'hot' || l.temperatureScore >= 70).length
  const inProcess = MOCK_LEADS.filter(l => l.status === 'process_started').length
  const closed = MOCK_LEADS.filter(l => l.status === 'closed' || l.status === 'process_completed').length
  const thisMonth = MOCK_LEADS.filter(l => {
    const d = new Date(l.createdAt)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length
  return { total, hot, inProcess, closed, thisMonth }
}

export const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  new:               { label: 'Nuevo',             color: '#5B8EC9', bgColor: 'rgba(91,142,201,0.12)' },
  nurturing:         { label: 'Nurturing',          color: '#C9A96E', bgColor: 'rgba(201,169,110,0.12)' },
  warm:              { label: 'Tibio',              color: '#E07B3A', bgColor: 'rgba(224,123,58,0.12)' },
  hot:               { label: 'Caliente',           color: '#E04040', bgColor: 'rgba(224,64,64,0.12)' },
  process_started:   { label: 'En Proceso',         color: '#9B72CF', bgColor: 'rgba(155,114,207,0.12)' },
  process_completed: { label: 'Proceso Completado', color: '#6BA368', bgColor: 'rgba(107,163,104,0.12)' },
  closed:            { label: 'Cerrado',            color: '#4A9B6B', bgColor: 'rgba(74,155,107,0.12)' },
  lost:              { label: 'Perdido',            color: '#C97B6B', bgColor: 'rgba(201,123,107,0.12)' },
}

export const SOURCE_CONFIG: Record<string, { label: string; icon: string }> = {
  lead_magnet: { label: 'Lead Magnet',    icon: '📄' },
  web_form:    { label: 'Formulario Web', icon: '🌐' },
  open_house:  { label: 'Open House',    icon: '🏠' },
  manual:      { label: 'Reg. Manual',   icon: '✍️' },
  ads:         { label: 'Meta Ads',      icon: '📣' },
  referral:    { label: 'Referido',      icon: '🤝' },
}

export const LANGUAGE_CONFIG: Record<string, { label: string; flag: string }> = {
  es: { label: 'Español',    flag: '🇪🇸' },
  en: { label: 'English',    flag: '🇺🇸' },
  pt: { label: 'Português',  flag: '🇧🇷' },
}

export interface LeadMagnet {
  id: string
  tenantId: string
  agentId: string
  title: string
  subtitle: string
  language: Language
  monthYear: string
  downloadUrl: string
  coverEmoji: string
  active: boolean
  stats: {
    totalDownloads: number
    leadsGenerated: number
    conversionRate: number
    avgTemperature: number
    openRate: number
  }
}

export const MOCK_LEAD_MAGNETS: LeadMagnet[] = [
  {
    id: 'lm-adriana-abr',
    tenantId: 'aj-real-estate',
    agentId: 'agent-adriana',
    title: 'Tu Primera Casa en Virginia',
    subtitle: 'Guía Completa Para Familias Hispanas · Edición Abril 2026',
    language: 'es',
    monthYear: 'Abr 2026',
    downloadUrl: '#',
    coverEmoji: '🏡',
    active: true,
    stats: { totalDownloads: 47, leadsGenerated: 31, conversionRate: 66, avgTemperature: 42, openRate: 58 },
  },
  {
    id: 'lm-john-abr',
    tenantId: 'aj-real-estate',
    agentId: 'agent-john',
    title: 'VA Loan Hampton Roads Guide',
    subtitle: 'The Military Family Playbook · April 2026 Edition',
    language: 'en',
    monthYear: 'Abr 2026',
    downloadUrl: '#',
    coverEmoji: '⭐',
    active: true,
    stats: { totalDownloads: 38, leadsGenerated: 24, conversionRate: 63, avgTemperature: 51, openRate: 64 },
  },
  {
    id: 'lm-melanie-abr',
    tenantId: 'aj-real-estate',
    agentId: 'agent-melanie',
    title: 'De Alquilar a Ser Dueño',
    subtitle: 'Guía Honesta Para Compradores Primerizos · Abril 2026',
    language: 'es',
    monthYear: 'Abr 2026',
    downloadUrl: '#',
    coverEmoji: '🔑',
    active: true,
    stats: { totalDownloads: 29, leadsGenerated: 18, conversionRate: 62, avgTemperature: 38, openRate: 55 },
  },
  {
    id: 'lm-viviane-abr',
    tenantId: 'aj-real-estate',
    agentId: 'agent-viviane',
    title: 'Guia do Comprador Brasileiro',
    subtitle: 'Como Comprar Seu Imóvel em Hampton Roads · Abril 2026',
    language: 'pt',
    monthYear: 'Abr 2026',
    downloadUrl: '#',
    coverEmoji: '🏠',
    active: true,
    stats: { totalDownloads: 21, leadsGenerated: 14, conversionRate: 67, avgTemperature: 45, openRate: 61 },
  },
  {
    id: 'lm-adriana-mar',
    tenantId: 'aj-real-estate',
    agentId: 'agent-adriana',
    title: 'Cómo Mejorar Tu Crédito en 90 Días',
    subtitle: 'Guía Práctica Para Compradores Hispanos · Marzo 2026',
    language: 'es',
    monthYear: 'Mar 2026',
    downloadUrl: '#',
    coverEmoji: '📈',
    active: false,
    stats: { totalDownloads: 63, leadsGenerated: 38, conversionRate: 60, avgTemperature: 39, openRate: 52 },
  },
  {
    id: 'lm-john-mar',
    tenantId: 'aj-real-estate',
    agentId: 'agent-john',
    title: 'PCS Relocation Checklist',
    subtitle: '60/30/15 Day Military Moving Guide · March 2026',
    language: 'en',
    monthYear: 'Mar 2026',
    downloadUrl: '#',
    coverEmoji: '📋',
    active: false,
    stats: { totalDownloads: 44, leadsGenerated: 28, conversionRate: 64, avgTemperature: 48, openRate: 61 },
  },
  {
    id: 'lm-melanie-mar',
    tenantId: 'aj-real-estate',
    agentId: 'agent-melanie',
    title: 'Costos Ocultos de Comprar Casa',
    subtitle: 'Lo Que Nadie Te Dice · Marzo 2026',
    language: 'es',
    monthYear: 'Mar 2026',
    downloadUrl: '#',
    coverEmoji: '💡',
    active: false,
    stats: { totalDownloads: 35, leadsGenerated: 21, conversionRate: 60, avgTemperature: 36, openRate: 50 },
  },
  {
    id: 'lm-viviane-mar',
    tenantId: 'aj-real-estate',
    agentId: 'agent-viviane',
    title: 'Impostos e Taxas na Compra de Imóvel',
    subtitle: 'Guia Financeiro Para Brasileiros · Março 2026',
    language: 'pt',
    monthYear: 'Mar 2026',
    downloadUrl: '#',
    coverEmoji: '📊',
    active: false,
    stats: { totalDownloads: 18, leadsGenerated: 11, conversionRate: 61, avgTemperature: 41, openRate: 57 },
  },
]

export function getLMsByAgent(agentId: string): LeadMagnet[] {
  return MOCK_LEAD_MAGNETS.filter(lm => lm.agentId === agentId)
}

export function getActiveLMs(): LeadMagnet[] {
  return MOCK_LEAD_MAGNETS.filter(lm => lm.active)
}
