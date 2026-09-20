import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Menu,
  MonitorCheck,
  RefreshCw,
  Save,
  Search,
  Server,
  UserCheck,
  UserX,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

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
  created_at: string
}

const DEFAULT_API_BASE = `${window.location.protocol}//${window.location.hostname}:10300`
const API_BASE = (import.meta.env.VITE_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, '')
const pageSizeOptions = [10, 25, 50, 100]

function App() {
  const [records, setRecords] = useState<AgentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [pageSize, setPageSize] = useState(10)
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingRecord, setEditingRecord] = useState<AgentRecord | null>(null)
  const [empIDInput, setEmpIDInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  const filteredRecords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return records
    return records.filter((record) =>
      [
        record.hostname,
        record.ip_address,
        record.mac_address,
        record.username,
        record.windows_version,
        record.cpu_name,
        record.emp_id,
      ].some((field) => field?.toLowerCase().includes(query)),
    )
  }, [records, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = filteredRecords.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endIndex = Math.min(safePage * pageSize, filteredRecords.length)

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

  function openEditModal(record: AgentRecord) {
    setEditingRecord(record)
    setEmpIDInput(record.emp_id ?? '')
  }

  function closeEditModal() {
    if (saving) return
    setEditingRecord(null)
    setEmpIDInput('')
  }

  async function saveEmpID() {
    if (!editingRecord) return
    setSaving(true)
    setError('')

    try {
      const response = await fetch(`${API_BASE}/api/agents/${editingRecord.id}/emp-id`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: empIDInput.trim() }),
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? `API responded ${response.status}`)
      }
      const updated = (await response.json()) as AgentRecord
      setRecords((items) => items.map((item) => (item.id === updated.id ? updated : item)))
      setEditingRecord(null)
      setEmpIDInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save emp_id failed')
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

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <nav className="sticky top-0 z-30 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50 shadow-[0_1px_0_rgba(15,23,42,0.05),0_12px_24px_-14px_rgba(15,23,42,0.35)]">
        <div className="flex w-full items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200 bg-gradient-to-br from-white to-slate-100 text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8),0_2px_6px_-2px_rgba(15,23,42,0.25)]">
              <Server size={23} aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal text-slate-950">CHECKCOM</h1>
              <p className="text-sm text-slate-500">Computer inventory dashboard</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={() => void loadRecords()}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
              disabled={refreshing}
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void exportExcel()}
              className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:-translate-y-px hover:border-slate-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
              disabled={exporting || records.length === 0}
            >
              <Download size={16} aria-hidden="true" />
              Export Excel
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm md:hidden"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-slate-200 bg-white px-4 py-3 shadow-inner md:hidden">
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => void loadRecords()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm"
                disabled={refreshing}
              >
                <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} aria-hidden="true" />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => void exportExcel()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 shadow-sm disabled:opacity-60"
                disabled={exporting || records.length === 0}
              >
                <Download size={16} aria-hidden="true" />
                Export Excel
              </button>
            </div>
          </div>
        )}
      </nav>

      <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <section className="mb-5 grid gap-4 md:grid-cols-3">
          <Metric
            icon={<MonitorCheck size={20} aria-hidden="true" />}
            label="Total computers"
            value={records.length.toLocaleString()}
          />
          <Metric
            icon={<UserCheck size={20} aria-hidden="true" />}
            label="Mapped emp_id"
            value={records.filter((item) => item.emp_id).length.toLocaleString()}
          />
          <Metric
            icon={<UserX size={20} aria-hidden="true" />}
            label="Unmapped emp_id"
            value={records.filter((item) => !item.emp_id).length.toLocaleString()}
          />
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl shadow-slate-200/70">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                Agent_TNLX inventory
              </h2>
              <p className="mt-1 text-sm text-slate-500">Showing computer data collected by RUN_CHECK</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  placeholder="ค้นหา..."
                  className="h-9 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-slate-500 sm:w-72"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Page size
                <select
                  value={pageSize}
                  onChange={(event) => handlePageSizeChange(event.target.value)}
                  className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 outline-none focus:border-slate-500"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {error && (
            <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="flex min-h-80 items-center justify-center text-sm text-slate-500">
              Loading data...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="flex min-h-80 items-center justify-center text-sm text-slate-500">
              {searchQuery ? 'No records match your search' : 'No computer records found'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px] border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <TableHead className="w-16 text-center">No.</TableHead>
                      <TableHead>hostname</TableHead>
                      <TableHead>ip_address</TableHead>
                      <TableHead>mac_address</TableHead>
                      <TableHead>username</TableHead>
                      <TableHead>windows_version</TableHead>
                      <TableHead>cpu_name</TableHead>
                      <TableHead>ram_total_gb</TableHead>
                      <TableHead>emp_id</TableHead>
                      <TableHead>created_at</TableHead>
                      <TableHead className="w-24 text-right">Action</TableHead>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedRecords.map((record, index) => (
                      <tr key={record.id} className="hover:bg-slate-50">
                        <TableCell className="text-center text-slate-500">{startIndex + index}</TableCell>
                        <TableCell className="font-medium text-slate-900">{record.hostname}</TableCell>
                        <TableCell>{record.ip_address}</TableCell>
                        <TableCell>{record.mac_address}</TableCell>
                        <TableCell>{record.username}</TableCell>
                        <TableCell>{record.windows_version}</TableCell>
                        <TableCell>{record.cpu_name}</TableCell>
                        <TableCell>{formatRAM(record.ram_total_gb)}</TableCell>
                        <TableCell>
                          {record.emp_id ? (
                            <span className="rounded bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                              {record.emp_id}
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </TableCell>
                        <TableCell>{record.created_at}</TableCell>
                        <TableCell className="text-right">
                          <button
                            type="button"
                            onClick={() => openEditModal(record)}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
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

              <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  Showing {startIndex}-{endIndex} of {filteredRecords.length.toLocaleString()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={safePage === 1}
                    className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                    Previous
                  </button>
                  <span className="min-w-24 text-center">
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={safePage === totalPages}
                    className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-300 bg-white px-3 font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      </main>

      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 p-4 sm:items-center">
          <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Edit employee mapping</h2>
                <p className="text-sm text-slate-500">{editingRecord.hostname}</p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 shadow-sm"
                aria-label="Close modal"
              >
                <X size={17} aria-hidden="true" />
              </button>
            </div>

            <div className="grid gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2">
              <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              <ReadOnlyField label="hostname" value={editingRecord.hostname} />
              <ReadOnlyField label="ip_address" value={editingRecord.ip_address} />
              <ReadOnlyField label="mac_address" value={editingRecord.mac_address} />
              <ReadOnlyField label="username" value={editingRecord.username} />
              <ReadOnlyField label="windows_version" value={editingRecord.windows_version} />
              <ReadOnlyField label="cpu_name" value={editingRecord.cpu_name} />
              <ReadOnlyField label="ram_total_gb" value={formatRAM(editingRecord.ram_total_gb)} />
              <ReadOnlyField label="created_at" value={editingRecord.created_at} />
              </div>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  emp_id (รหัสพนักงาน)
                </span>
                <input
                  value={empIDInput}
                  onChange={(event) => setEmpIDInput(event.target.value.toUpperCase())}
                  maxLength={20}
                  className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  placeholder="TXXXX"
                />
              </label>
            </div>

            <div className="sticky bottom-0 flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
              <button
                type="button"
                onClick={closeEditModal}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm"
                disabled={saving}
              >
                <X size={16} aria-hidden="true" />
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveEmpID()}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={saving}
              >
                <Save size={16} aria-hidden="true" />
                {saving ? 'Updating...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-xl shadow-slate-200/70">
      <div className="absolute inset-x-0 top-0 h-1 bg-slate-900" />
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-2 truncate text-2xl font-semibold text-slate-950">{value}</div>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 shadow-sm">
          {icon}
        </div>
      </div>
    </div>
  )
}

function TableHead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap px-3 py-3 font-semibold ${className}`}>{children}</th>
}

function TableCell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`max-w-72 truncate whitespace-nowrap px-3 py-3 text-slate-700 ${className}`}>{children}</td>
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="min-h-11 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
        {value || '-'}
      </div>
    </div>
  )
}

function formatRAM(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return '-'
  }
  return value.toFixed(2)
}

export default App
