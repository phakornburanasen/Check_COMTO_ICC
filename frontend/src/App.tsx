import {
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Edit3,
  FileInput,
  Laptop,
  Menu,
  Monitor,
  MonitorCheck,
  Plus,
  Printer,
  Projector,
  RefreshCw,
  Save,
  ScanLine,
  Search,
  Tv,
  UserCheck,
  UserX,
  X,
  Zap,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

type DeviceType = '' | 'PC' | 'Notebook'
type UserFilter = 'all' | 'mapped' | 'unmapped'

type AgentRecord = {
  id: number
  hostname: string
  ip_address: string
  mac_address: string
  username: string
  windows_version: string
  cpu_name: string
  ram_total_gb: number | null
  emp_id: string
  type: DeviceType
  dep: string
  office_version: string
  created_at: string
}

type AgentForm = {
  hostname: string
  ip_address: string
  mac_address: string
  username: string
  windows_version: string
  cpu_name: string
  ram_total_gb: string
  emp_id: string
  type: DeviceType
  dep: string
  office_version: string
}

const DEFAULT_API_BASE = `${window.location.protocol}//${window.location.hostname}:10300`
const API_BASE = (import.meta.env.VITE_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, '')
const pageSizeOptions = [10, 25, 50, 100]
const emptyForm: AgentForm = {
  hostname: '',
  ip_address: '',
  mac_address: '',
  username: '',
  windows_version: '',
  cpu_name: '',
  ram_total_gb: '',
  emp_id: '',
  type: '',
  dep: '',
  office_version: '',
}

function App() {
  const [records, setRecords] = useState<AgentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | DeviceType>('all')
  const [userFilter, setUserFilter] = useState<UserFilter>('all')
  const [editingRecord, setEditingRecord] = useState<AgentRecord | null>(null)
  const [editForm, setEditForm] = useState({ emp_id: '', type: '' as DeviceType, dep: '' })
  const [addingRecord, setAddingRecord] = useState(false)
  const [addForm, setAddForm] = useState<AgentForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [exporting, setExporting] = useState(false)

  const stats = useMemo(
    () => ({
      total: records.length,
      pc: records.filter((item) => item.type === 'PC').length,
      notebook: records.filter((item) => item.type === 'Notebook').length,
      mapped: records.filter((item) => item.emp_id).length,
      unmapped: records.filter((item) => !item.emp_id).length,
    }),
    [records],
  )

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return records.filter((record) => {
      const matchType = typeFilter === 'all' || record.type === typeFilter
      if (!matchType) return false
      if (userFilter === 'mapped' && !record.emp_id) return false
      if (userFilter === 'unmapped' && record.emp_id) return false
      if (!query) return true
      return [
        record.hostname,
        record.ip_address,
        record.mac_address,
        record.username,
        record.windows_version,
        record.cpu_name,
        record.emp_id,
        record.type,
        record.dep,
        record.office_version,
      ].some((field) => field?.toLowerCase().includes(query))
    })
  }, [records, searchQuery, typeFilter, userFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = filteredRecords.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endIndex = Math.min(safePage * pageSize, filteredRecords.length)

  const hasFilters = searchQuery.trim() !== '' || typeFilter !== 'all' || userFilter !== 'all'
  const addFormError = validateAgentForm(addForm)
  const listLabel = [
    typeFilter === 'all' ? 'อุปกรณ์ทั้งหมด' : typeFilter,
    userFilter === 'mapped' ? 'ผูก Emp ID แล้ว' : userFilter === 'unmapped' ? 'ยังไม่ผูก Emp ID' : '',
  ]
    .filter(Boolean)
    .join(' · ')

  const pagedRecords = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredRecords.slice(start, start + pageSize)
  }, [filteredRecords, pageSize, safePage])

  const loadRecords = useCallback(async (options: { initial?: boolean } = {}) => {
    if (options.initial) {
      setLoading(true)
    } else {
      setRefreshing(true)
    }
    setError('')

    try {
      const response = await fetch(`${API_BASE}/api/agents`)
      if (!response.ok) {
        throw new Error(`API responded ${response.status}`)
      }
      const data = (await response.json()) as AgentRecord[]
      setRecords(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load data failed')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRecords({ initial: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadRecords])

  function openAddModal() {
    setAddForm(emptyForm)
    setModalError('')
    setAddingRecord(true)
    setMenuOpen(false)
  }

  function closeAddModal() {
    if (saving) return
    setAddingRecord(false)
    setAddForm(emptyForm)
  }

  function openEditModal(record: AgentRecord) {
    setModalError('')
    setEditingRecord(record)
    setEditForm({
      emp_id: record.emp_id ?? '',
      type: record.type ?? '',
      dep: record.dep ?? '',
    })
  }

  function closeEditModal() {
    if (saving) return
    setEditingRecord(null)
    setEditForm({ emp_id: '', type: '', dep: '' })
  }

  async function createAgent() {
    if (addFormError) {
      setModalError(addFormError)
      return
    }
    setSaving(true)
    setModalError('')

    try {
      const response = await fetch(`${API_BASE}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(addForm)),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? `API responded ${response.status}`)
      }
      const created = (await response.json()) as AgentRecord
      setRecords((items) => [created, ...items])
      setAddingRecord(false)
      setAddForm(emptyForm)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Create agent failed')
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit() {
    if (!editingRecord) return
    setSaving(true)
    setModalError('')

    try {
      const response = await fetch(`${API_BASE}/api/agents/${editingRecord.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emp_id: editForm.emp_id.trim(),
          type: editForm.type,
          dep: editForm.dep.trim(),
        }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? `API responded ${response.status}`)
      }
      const updated = (await response.json()) as AgentRecord
      setRecords((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setEditingRecord(null)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Save agent failed')
    } finally {
      setSaving(false)
    }
  }

  async function exportExcel() {
    setExporting(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/api/export`)
      if (!response.ok) {
        throw new Error(`Export failed ${response.status}`)
      }
      const blob = await response.blob()
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = 'list_CHECKCOM.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(href)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value))
    setCurrentPage(1)
  }

  function handleSearchChange(value: string) {
    setSearchQuery(value)
    setCurrentPage(1)
  }

  function handleTypeFilterChange(value: 'all' | DeviceType) {
    setTypeFilter(value)
    setCurrentPage(1)
  }

  function handleUserFilterChange(value: UserFilter) {
    setUserFilter(value)
    setCurrentPage(1)
  }

  function resetFilters() {
    setSearchQuery('')
    setTypeFilter('all')
    setUserFilter('all')
    setCurrentPage(1)
  }

  const status = error
    ? { label: 'Error', dot: 'bg-red-400', text: 'text-red-200' }
    : loading || refreshing
      ? { label: 'Loading', dot: 'bg-amber-300 animate-pulse', text: 'text-amber-100' }
      : { label: 'Ready', dot: 'bg-cyan-300', text: 'text-cyan-100' }

  return (
    <div className="min-h-screen bg-[#f4f8fb] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-950/20 bg-[#0f1b2d] text-white shadow-lg shadow-slate-900/15">
        <div className="flex min-h-20 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-5">
            <img src={`${import.meta.env.BASE_URL}tnlx.svg`} alt="TNLX" className="h-9 w-auto shrink-0" />
            <div className="hidden h-8 w-px bg-white/20 sm:block" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight text-white">SSO CHECK</h1>
              <p className="truncate text-sm text-cyan-100/85">Asset management workspace</p>
            </div>
          </div>

          <nav className="hidden items-center gap-3 lg:flex">
            <TopNavItem>Tools</TopNavItem>
            <TopNavItem active icon={<MonitorCheck size={15} />}>
              Assets
            </TopNavItem>
            <TopNavItem>Reports</TopNavItem>
          </nav>

          <div className={`hidden items-center gap-2 text-sm font-medium md:flex ${status.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 bg-white/10 text-white lg:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {menuOpen && (
          <div className="grid gap-2 border-t border-white/10 px-4 py-3 lg:hidden">
            <ToolbarButton onClick={openAddModal} variant="primary" icon={<Plus size={16} />}>
              Add
            </ToolbarButton>
            <ToolbarButton onClick={() => void loadRecords()} disabled={refreshing} icon={<RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />}>
              Refresh
            </ToolbarButton>
            <ToolbarButton onClick={() => void exportExcel()} disabled={exporting || records.length === 0} icon={<Download size={16} />}>
              Export Excel
            </ToolbarButton>
          </div>
        )}
      </header>

      <main className="grid gap-5 px-4 py-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:px-6">
        <aside className="space-y-5 rounded-lg border border-cyan-100 bg-white p-5 shadow-sm">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Agent TNLX</p>
            <h2 className="mt-3 text-2xl font-bold text-slate-950">Check Asset</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">จัดการข้อมูลเครื่องและอุปกรณ์ในระบบ SSO</p>
          </div>

          <div className="grid gap-3">
            <ToolbarButton onClick={openAddModal} variant="primary" icon={<Plus size={17} />}>
              เพิ่มข้อมูล
            </ToolbarButton>
            <ToolbarButton onClick={() => void exportExcel()} disabled={exporting || records.length === 0} icon={<Download size={17} />}>
              Export Excel
            </ToolbarButton>
          </div>

          <div className="grid grid-cols-3 gap-2 border-y border-slate-200 py-5">
            <MetricTile label="ทั้งหมด" value={stats.total} active={typeFilter === 'all'} onClick={() => handleTypeFilterChange('all')} />
            <MetricTile label="PC" value={stats.pc} active={typeFilter === 'PC'} onClick={() => handleTypeFilterChange('PC')} />
            <MetricTile label="Notebook" value={stats.notebook} active={typeFilter === 'Notebook'} onClick={() => handleTypeFilterChange('Notebook')} />
          </div>

          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-slate-950">ประเภทอุปกรณ์</h3>
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                aria-label="Reset filters"
                title="ล้างตัวกรองทั้งหมด"
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FilterButton active={typeFilter === 'all'} icon={<Database size={16} />} onClick={() => handleTypeFilterChange('all')}>
                ทั้งหมด
              </FilterButton>
              <FilterButton active={typeFilter === 'PC'} icon={<Monitor size={16} />} onClick={() => handleTypeFilterChange('PC')}>
                PC
              </FilterButton>
              <FilterButton active={typeFilter === 'Notebook'} icon={<Laptop size={16} />} onClick={() => handleTypeFilterChange('Notebook')}>
                Notebook
              </FilterButton>
              <FilterButton icon={<Printer size={16} />} disabled soon>
                Printer
              </FilterButton>
              <FilterButton icon={<Zap size={16} />} disabled soon>
                UPS
              </FilterButton>
              <FilterButton icon={<ScanLine size={16} />} disabled soon>
                Scanner
              </FilterButton>
              <FilterButton icon={<Projector size={16} />} disabled soon>
                Projector
              </FilterButton>
              <FilterButton icon={<Tv size={16} />} disabled soon>
                Video
              </FilterButton>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-5">
            <h3 className="font-semibold text-slate-950">User Check</h3>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat
                icon={<UserCheck size={15} />}
                label="Mapped"
                value={stats.mapped}
                active={userFilter === 'mapped'}
                onClick={() => handleUserFilterChange(userFilter === 'mapped' ? 'all' : 'mapped')}
              />
              <MiniStat
                icon={<UserX size={15} />}
                label="Unmapped"
                value={stats.unmapped}
                active={userFilter === 'unmapped'}
                onClick={() => handleUserFilterChange(userFilter === 'unmapped' ? 'all' : 'unmapped')}
              />
            </div>
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-lg border border-cyan-100 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Asset Workspace</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-bold text-slate-950">Asset List</h2>
                <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                  {filteredRecords.length.toLocaleString()} รายการ
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{listLabel}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <ToolbarButton onClick={() => void loadRecords()} disabled={refreshing} icon={<RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />}>
                Refresh
              </ToolbarButton>
              <ToolbarButton onClick={openAddModal} variant="primary" icon={<Plus size={16} />}>
                Add
              </ToolbarButton>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder="ค้นหา..."
                className="h-10 w-full rounded-lg border border-cyan-200 bg-white pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <label className="flex items-center gap-3 text-sm text-slate-600">
              User check
              <select
                value={userFilter}
                onChange={(event) => handleUserFilterChange(event.target.value as UserFilter)}
                className="h-10 rounded-lg border border-cyan-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                <option value="all">ทั้งหมด</option>
                <option value="mapped">ผูก Emp ID แล้ว</option>
                <option value="unmapped">ยังไม่ผูก Emp ID</option>
              </select>
            </label>
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-teal-700 hover:bg-teal-50"
              >
                <X size={15} />
                ล้างตัวกรอง
              </button>
            )}
          </div>

          {error && <div className="border-y border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>}

          {loading ? (
            <EmptyState>Loading data...</EmptyState>
          ) : filteredRecords.length === 0 ? (
            <EmptyState>
              {hasFilters ? (
                <div className="grid justify-items-center gap-3">
                  ไม่พบรายการที่ตรงกับตัวกรอง
                  <ToolbarButton onClick={resetFilters} icon={<X size={16} />}>
                    ล้างตัวกรอง
                  </ToolbarButton>
                </div>
              ) : (
                'ยังไม่มีข้อมูลอุปกรณ์'
              )}
            </EmptyState>
          ) : (
            <>
              <div className="overflow-auto border-t border-slate-200">
                <table className="w-full min-w-[1480px] border-collapse text-left text-sm">
                  <thead className="bg-[#eef4f8] text-[11px] uppercase tracking-wide text-slate-700">
                    <tr>
                      <TableHead className="w-14 text-center">#</TableHead>
                      <TableHead>Hostname</TableHead>
                      <TableHead>IP</TableHead>
                      <TableHead>MAC</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Dep</TableHead>
                      <TableHead>Windows</TableHead>
                      <TableHead>CPU</TableHead>
                      <TableHead>RAM</TableHead>
                      <TableHead>Office</TableHead>
                      <TableHead>Emp ID</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-20 text-right">Edit</TableHead>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedRecords.map((record, index) => (
                      <tr key={record.id} className="transition hover:bg-teal-50/35">
                        <TableCell className="text-center text-slate-500">{startIndex + index}</TableCell>
                        <TableCell className="font-semibold text-slate-800">{record.hostname || '-'}</TableCell>
                        <TableCell>{record.ip_address || '-'}</TableCell>
                        <TableCell>{record.mac_address || '-'}</TableCell>
                        <TableCell>{record.username || '-'}</TableCell>
                        <TableCell>
                          <TypeBadge value={record.type} />
                        </TableCell>
                        <TableCell>{record.dep || '-'}</TableCell>
                        <TableCell>{record.windows_version || '-'}</TableCell>
                        <TableCell>{record.cpu_name || '-'}</TableCell>
                        <TableCell>{formatRAM(record.ram_total_gb)}</TableCell>
                        <TableCell>{record.office_version || '-'}</TableCell>
                        <TableCell>
                          {record.emp_id ? (
                            <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                              {record.emp_id}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>{record.created_at || '-'}</TableCell>
                        <TableCell className="text-right">
                          <button
                            type="button"
                            onClick={() => openEditModal(record)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-cyan-200 bg-white text-slate-700 transition hover:border-teal-400 hover:text-teal-700"
                            aria-label={`Edit ${record.hostname}`}
                          >
                            <Edit3 size={15} aria-hidden="true" />
                          </button>
                        </TableCell>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
                <div>
                  Showing <b>{startIndex}-{endIndex}</b> of <b>{filteredRecords.length.toLocaleString()}</b>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2">
                    Rows per page:
                    <select
                      value={pageSize}
                      onChange={(event) => handlePageSizeChange(event.target.value)}
                      className="h-9 rounded-lg border border-cyan-200 bg-white px-3 text-sm text-slate-800 outline-none"
                    >
                      {pageSizeOptions.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <PageButton onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage === 1}>
                    <ChevronLeft size={16} />
                    Prev
                  </PageButton>
                  <span className="grid h-9 min-w-9 place-items-center rounded-lg bg-teal-600 px-3 font-semibold text-white">
                    {safePage}
                  </span>
                  <span className="px-1">/ {totalPages}</span>
                  <PageButton onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage === totalPages}>
                    Next
                    <ChevronRight size={16} />
                  </PageButton>
                </div>
              </div>
            </>
          )}
        </section>
      </main>

      {addingRecord && (
        <AgentModal title="Add asset data" subtitle="Manual Agent_TNLX record" saving={saving} error={modalError} onClose={closeAddModal} onSave={() => void createAgent()}>
          <AgentFormFields form={addForm} setForm={setAddForm} />
        </AgentModal>
      )}

      {editingRecord && (
        <AgentModal title="Edit asset data" subtitle={editingRecord.hostname || '-'} saving={saving} error={modalError} onClose={closeEditModal} onSave={() => void saveEdit()}>
          <div className="grid gap-4 sm:grid-cols-2">
            <ReadOnlyField label="hostname" value={editingRecord.hostname} />
            <ReadOnlyField label="ip_address" value={editingRecord.ip_address} />
            <ReadOnlyField label="mac_address" value={editingRecord.mac_address} />
            <ReadOnlyField label="username" value={editingRecord.username} />
            <ReadOnlyField label="windows_version" value={editingRecord.windows_version} />
            <ReadOnlyField label="cpu_name" value={editingRecord.cpu_name} />
            <ReadOnlyField label="ram_total_gb" value={formatRAM(editingRecord.ram_total_gb)} />
            <ReadOnlyField label="office_version" value={editingRecord.office_version} />
            <EditableText
              label="emp_id"
              value={editForm.emp_id}
              maxLength={20}
              onChange={(value) => setEditForm((form) => ({ ...form, emp_id: value.toUpperCase() }))}
              placeholder="TXXXX"
            />
            <EditableSelect
              label="type"
              value={editForm.type}
              onChange={(value) => setEditForm((form) => ({ ...form, type: value }))}
            />
            <EditableText
              label="dep"
              value={editForm.dep}
              maxLength={100}
              onChange={(value) => setEditForm((form) => ({ ...form, dep: value }))}
              placeholder="2AM05"
            />
            <ReadOnlyField label="created_at" value={editingRecord.created_at} />
          </div>
        </AgentModal>
      )}
    </div>
  )
}

function TopNavItem({ active = false, icon, children }: { active?: boolean; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className={`inline-flex h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${active ? 'bg-white/10 text-cyan-100' : 'text-cyan-100/90'}`}>
      {icon}
      {children}
    </div>
  )
}

function ToolbarButton({ children, disabled = false, icon, onClick, variant = 'default' }: { children: ReactNode; disabled?: boolean; icon: ReactNode; onClick: () => void; variant?: 'default' | 'primary' }) {
  const classes =
    variant === 'primary'
      ? 'border-teal-700 bg-teal-700 text-white hover:bg-teal-800'
      : 'border-cyan-200 bg-white text-slate-800 hover:border-teal-300 hover:bg-teal-50'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${classes}`}
    >
      {icon}
      {children}
    </button>
  )
}

function MetricTile({ active = false, label, onClick, value }: { active?: boolean; label: string; onClick: () => void; value: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border px-3 py-4 text-center transition ${active ? 'border-teal-200 bg-teal-50 text-teal-700' : 'border-cyan-100 bg-slate-50 text-slate-900 hover:border-teal-200'}`}
    >
      <div className="truncate text-2xl font-bold">{value.toLocaleString()}</div>
      <div className="mt-1 truncate text-xs text-slate-500">{label}</div>
    </button>
  )
}

function MiniStat({ active = false, icon, label, onClick, value }: { active?: boolean; icon: ReactNode; label: string; onClick: () => void; value: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border px-3 py-3 text-left transition ${active ? 'border-teal-200 bg-teal-50' : 'border-cyan-100 bg-slate-50 hover:border-teal-200'}`}
    >
      <div className={`flex items-center gap-2 text-xs font-semibold ${active ? 'text-teal-700' : 'text-slate-500'}`}>
        {icon}
        {label}
      </div>
      <div className="mt-2 text-xl font-bold text-slate-950">{value.toLocaleString()}</div>
    </button>
  )
}

function FilterButton({ active = false, children, disabled = false, icon, onClick, soon = false }: { active?: boolean; children: ReactNode; disabled?: boolean; icon: ReactNode; onClick?: () => void; soon?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={soon ? 'เร็วๆ นี้' : undefined}
      className={`relative flex min-h-16 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
        active ? 'border-teal-100 bg-teal-50 text-teal-700' : 'border-cyan-100 bg-white text-slate-900 hover:border-teal-200 hover:bg-teal-50'
      }`}
    >
      {icon}
      <span className="truncate">{children}</span>
      {soon && <span className="absolute right-1.5 top-1.5 rounded bg-slate-100 px-1 text-[9px] font-bold uppercase text-slate-500">Soon</span>}
    </button>
  )
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="flex min-h-80 items-center justify-center text-sm text-slate-500">{children}</div>
}

function TableHead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap px-4 py-3 font-bold ${className}`}>{children}</th>
}

function TableCell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`max-w-72 truncate whitespace-nowrap px-4 py-3 text-slate-700 ${className}`}>{children}</td>
}

function PageButton({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-1 rounded-lg border border-cyan-200 bg-white px-3 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  )
}

function TypeBadge({ value }: { value: DeviceType }) {
  if (!value) return <span className="text-slate-400">-</span>
  const isNotebook = value === 'Notebook'
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isNotebook ? 'bg-indigo-50 text-indigo-700' : 'bg-cyan-50 text-cyan-700'}`}>
      {value}
    </span>
  )
}

function AgentModal({ children, error, onClose, onSave, saving, subtitle, title }: { children: ReactNode; error: string; onClose: () => void; onSave: () => void; saving: boolean; subtitle: string; title: string }) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 sm:items-center">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{title}</h2>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-cyan-200 bg-white text-slate-600 shadow-sm"
            aria-label="Close modal"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
        {error && <div className="shrink-0 border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</div>}
        <div className="overflow-y-auto px-5 py-5">{children}</div>
        <div className="sticky bottom-0 flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-cyan-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm"
            disabled={saving}
          >
            <X size={16} aria-hidden="true" />
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
          >
            <Save size={16} aria-hidden="true" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AgentFormFields({ form, setForm }: { form: AgentForm; setForm: React.Dispatch<React.SetStateAction<AgentForm>> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <EditableText label="hostname" value={form.hostname} maxLength={100} onChange={(value) => setForm((item) => ({ ...item, hostname: value.toUpperCase() }))} required />
      <EditableText label="ip_address" value={form.ip_address} maxLength={50} onChange={(value) => setForm((item) => ({ ...item, ip_address: value }))} placeholder="10.0.0.1" />
      <EditableText label="mac_address" value={form.mac_address} maxLength={50} onChange={(value) => setForm((item) => ({ ...item, mac_address: value.toUpperCase() }))} placeholder="AA:BB:CC:DD:EE:FF" />
      <EditableText label="username" value={form.username} maxLength={100} onChange={(value) => setForm((item) => ({ ...item, username: value }))} placeholder="HOST\\user" />
      <EditableText label="windows_version" value={form.windows_version} maxLength={255} onChange={(value) => setForm((item) => ({ ...item, windows_version: value }))} />
      <EditableText label="cpu_name" value={form.cpu_name} maxLength={255} onChange={(value) => setForm((item) => ({ ...item, cpu_name: value }))} />
      <EditableText label="ram_total_gb" value={form.ram_total_gb} onChange={(value) => setForm((item) => ({ ...item, ram_total_gb: value }))} placeholder="16" inputMode="decimal" />
      <EditableText label="emp_id" value={form.emp_id} maxLength={20} onChange={(value) => setForm((item) => ({ ...item, emp_id: value.toUpperCase() }))} placeholder="TXXXX" />
      <EditableSelect label="type" value={form.type} onChange={(value) => setForm((item) => ({ ...item, type: value }))} />
      <EditableText label="dep" value={form.dep} maxLength={100} onChange={(value) => setForm((item) => ({ ...item, dep: value }))} placeholder="2AM05" />
      <EditableText label="office_version" value={form.office_version} maxLength={255} onChange={(value) => setForm((item) => ({ ...item, office_version: value }))} />
      <div className="rounded-lg border border-cyan-100 bg-teal-50/50 p-4 text-sm leading-6 text-slate-600">
        <div className="mb-2 flex items-center gap-2 font-semibold text-teal-800">
          <FileInput size={16} />
          Manual record
        </div>
        ข้อมูลที่เพิ่มด้วยฟอร์มนี้จะบันทึกลง Agent_TNLX โดยตรง และแก้ emp_id / type / dep ต่อได้จากปุ่ม Edit
      </div>
    </div>
  )
}

function EditableText({ inputMode, label, maxLength, onChange, placeholder = '', required = false, value }: { inputMode?: 'decimal'; label: string; maxLength?: number; onChange: (value: string) => void; placeholder?: string; required?: boolean; value: string }) {
  return (
    <label>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={maxLength}
        inputMode={inputMode}
        className="h-11 w-full rounded-lg border border-cyan-200 px-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        placeholder={placeholder}
      />
    </label>
  )
}

function EditableSelect({ label, onChange, value }: { label: string; onChange: (value: DeviceType) => void; value: DeviceType }) {
  return (
    <label>
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as DeviceType)}
        className="h-11 w-full rounded-lg border border-cyan-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
      >
        <option value="">-</option>
        <option value="PC">PC</option>
        <option value="Notebook">Notebook</option>
      </select>
    </label>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="min-h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
        {value || '-'}
      </div>
    </div>
  )
}

function validateAgentForm(form: AgentForm) {
  if (!form.hostname.trim()) return 'กรุณากรอก hostname'
  const ram = form.ram_total_gb.trim()
  if (ram !== '' && (Number.isNaN(Number(ram)) || Number(ram) < 0)) return 'ram_total_gb ต้องเป็นตัวเลข'
  return ''
}

function toPayload(form: AgentForm) {
  const ram = Number(form.ram_total_gb)
  return {
    hostname: form.hostname.trim(),
    ip_address: form.ip_address.trim(),
    mac_address: form.mac_address.trim(),
    username: form.username.trim(),
    windows_version: form.windows_version.trim(),
    cpu_name: form.cpu_name.trim(),
    ram_total_gb: form.ram_total_gb.trim() === '' || Number.isNaN(ram) ? null : ram,
    emp_id: form.emp_id.trim(),
    type: form.type,
    dep: form.dep.trim(),
    office_version: form.office_version.trim(),
  }
}

function formatRAM(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return '-'
  }
  return Number(value).toFixed(2)
}

export default App
