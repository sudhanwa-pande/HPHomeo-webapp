"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Filter,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SkeletonTableRows } from "./skeleton-patterns";
import { EmptyState } from "./empty-state";
import { cn } from "@/lib/utils";

interface DataTableFilterOption {
  label: string;
  value: string;
}

interface DataTableFilterConfig {
  id: string;
  label: string;
  options: DataTableFilterOption[];
  allLabel?: string;
}

interface SavedViewConfig {
  id: string;
  label: string;
  globalFilter?: string;
  sorting?: SortingState;
  columnFilters?: ColumnFiltersState;
  columnVisibility?: VisibilityState;
}

interface BulkActionContext<TData> {
  selectedRows: TData[];
  clearSelection: () => void;
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  loading?: boolean;
  emptyIcon?: React.ComponentType<{ className?: string }>;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  className?: string;
  stickyHeader?: boolean;
  searchPlaceholder?: string;
  filterOptions?: DataTableFilterConfig[];
  savedViews?: SavedViewConfig[];
  defaultViewId?: string;
  storageKey?: string;
  enableRowSelection?: boolean;
  bulkActions?: (context: BulkActionContext<TData>) => React.ReactNode;
  toolbarActions?: React.ReactNode;
  rowClassName?: (row: TData) => string | undefined;
  cellClassName?: (row: TData) => string | undefined;
  getRowId?: (row: TData, index: number) => string;
  density?: "comfortable" | "compact";
  rowSurface?: "default" | "card";
}

interface PersistedState {
  globalFilter: string;
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  columnVisibility: VisibilityState;
  viewId: string | null;
}

const STORAGE_VERSION = 1;

function readStoredState(storageKey?: string): PersistedState | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState & { version?: number };
    if (parsed.version !== STORAGE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function DataTable<TData>({
  columns,
  data,
  loading = false,
  emptyIcon,
  emptyTitle = "No data",
  emptyDescription,
  emptyAction,
  onRowClick,
  className,
  stickyHeader = true,
  searchPlaceholder = "Search",
  filterOptions,
  savedViews,
  defaultViewId,
  storageKey,
  enableRowSelection = false,
  bulkActions,
  toolbarActions,
  rowClassName,
  cellClassName,
  getRowId,
  density = "comfortable",
  rowSurface = "default",
}: DataTableProps<TData>) {
  const firstSavedViewId = savedViews?.[0]?.id ?? null;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [activeViewId, setActiveViewId] = useState<string | null>(defaultViewId ?? firstSavedViewId);
  const lastAppliedViewIdRef = useRef<string | null>(null);

  useEffect(() => {
    const stored = readStoredState(storageKey);
    if (!stored) return;
    setGlobalFilter(stored.globalFilter ?? "");
    setSorting(stored.sorting ?? []);
    setColumnFilters(stored.columnFilters ?? []);
    setColumnVisibility(stored.columnVisibility ?? {});
    setActiveViewId(stored.viewId ?? defaultViewId ?? firstSavedViewId);
  }, [defaultViewId, firstSavedViewId, storageKey]);

  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        version: STORAGE_VERSION,
        globalFilter,
        sorting,
        columnFilters,
        columnVisibility,
        viewId: activeViewId,
      })
    );
  }, [activeViewId, columnFilters, columnVisibility, globalFilter, sorting, storageKey]);

  useEffect(() => {
    if (!savedViews?.length || !activeViewId) return;
    if (lastAppliedViewIdRef.current === activeViewId) return;

    const view = savedViews.find((item) => item.id === activeViewId);
    if (!view) return;

    setSorting(view.sorting ?? []);
    setColumnFilters(view.columnFilters ?? []);
    setColumnVisibility(view.columnVisibility ?? {});
    setGlobalFilter(view.globalFilter ?? "");
    lastAppliedViewIdRef.current = activeViewId;
  }, [activeViewId, savedViews]);

  const selectionColumn = useMemo<ColumnDef<TData, unknown>>(
    () => ({
      id: "__select__",
      enableSorting: false,
      enableColumnFilter: false,
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Select all rows"
          className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
          checked={table.getIsAllPageRowsSelected()}
          ref={(node) => {
            if (node) node.indeterminate = table.getIsSomePageRowsSelected();
          }}
          onChange={table.getToggleAllPageRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label="Select row"
          className="h-4 w-4 rounded border-border text-brand focus:ring-brand/30"
          checked={row.getIsSelected()}
          ref={(node) => {
            if (node) node.indeterminate = row.getIsSomeSelected();
          }}
          onClick={(event) => event.stopPropagation()}
          onChange={row.getToggleSelectedHandler()}
        />
      ),
      size: 36,
    }),
    []
  );

  const resolvedColumns = useMemo(
    () => (enableRowSelection ? [selectionColumn, ...columns] : columns),
    [columns, enableRowSelection, selectionColumn]
  );

  const table = useReactTable({
    data,
    columns: resolvedColumns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    getRowId,
    enableRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
  });

  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const filteredRowsCount = table.getFilteredRowModel().rows.length;
  const hasToolbar =
    Boolean(savedViews?.length) ||
    Boolean(filterOptions?.length) ||
    Boolean(toolbarActions) ||
    Boolean(searchPlaceholder) ||
    Boolean(enableRowSelection && bulkActions && selectedRows.length > 0);

  return (
    <div
      className={cn(
        "surface-panel overflow-hidden border border-border/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.98))] shadow-[0_20px_60px_-40px_rgba(15,23,42,0.22)]",
        className
      )}
    >
      {hasToolbar ? (
        <div className="border-b border-border/50 bg-[linear-gradient(180deg,rgba(244,247,251,0.92),rgba(255,255,255,0.92))] px-3 py-3.5 md:px-4 md:py-4">
          <div className="flex flex-col gap-3">
            {savedViews?.length ? (
              <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
                <Tabs value={activeViewId ?? undefined} onValueChange={setActiveViewId} className="min-w-0">
                  <TabsList className="h-auto flex-wrap rounded-2xl border border-border/60 bg-white/90 p-1 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.28)]">
                    {savedViews.map((view) => (
                      <TabsTrigger
                        key={view.id}
                        value={view.id}
                        className="rounded-xl px-3 py-1.5 type-body-sm text-brand-subtext transition-all data-active:border-border/60 data-active:bg-white data-active:text-brand-dark data-active:shadow-[0_8px_18px_-14px_rgba(15,23,42,0.25)]"
                      >
                        {view.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>

                <div className="inline-flex h-9 items-center gap-2 self-start rounded-full border border-border/60 bg-white/82 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-subtext shadow-sm xl:self-auto">
                  <span className="h-2 w-2 rounded-full bg-brand-accent" />
                  {loading ? "Loading records" : `${filteredRowsCount} records`}
                </div>
              </div>
            ) : null}

            <div className="rounded-[24px] border border-border/50 bg-white/78 p-2.5 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.28)] backdrop-blur-sm">
              <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-1 flex-col gap-2.5 lg:flex-row lg:items-center">
                  <div className="relative min-w-0 flex-1 xl:max-w-md">
                    <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-bg text-brand-subtext">
                        <Search className="h-3.5 w-3.5" />
                      </span>
                    </div>
                    <Input
                      value={globalFilter}
                      onChange={(event) => setGlobalFilter(event.target.value)}
                      placeholder={searchPlaceholder}
                      className="h-10 rounded-2xl border-border/60 bg-white/95 pl-12 pr-4 type-body-sm shadow-none placeholder:text-brand-subtext/75"
                    />
                  </div>

                  {filterOptions?.length ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {filterOptions.map((filter) => {
                        const current = (table.getColumn(filter.id)?.getFilterValue() as string | undefined) ?? "";
                        const currentLabel =
                          filter.options.find((option) => option.value === current)?.label ??
                          filter.allLabel ??
                          "All";
                        return (
                          <label
                            key={filter.id}
                            className="group relative flex h-10 min-w-[170px] items-center gap-2 rounded-2xl border border-border/60 bg-white/95 px-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.28)] transition-colors hover:border-brand/20 hover:bg-white"
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand-bg text-brand-subtext">
                              <Filter className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-subtext/70">
                                {filter.label}
                              </p>
                              <p className="truncate text-[13px] font-medium text-brand-dark">{currentLabel}</p>
                            </div>
                            <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-brand-subtext/80" />
                            <select
                              value={current}
                              onChange={(event) =>
                                table.getColumn(filter.id)?.setFilterValue(event.target.value || undefined)
                              }
                              className="absolute inset-0 cursor-pointer opacity-0"
                              aria-label={filter.label}
                            >
                              <option value="">{filter.allLabel ?? "All"}</option>
                              {filter.options.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {enableRowSelection && bulkActions && selectedRows.length > 0 ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-brand/20 bg-brand/5 px-2.5 py-2 shadow-[0_10px_22px_-20px_rgba(15,23,42,0.24)]">
                      <span className="px-1 type-body-sm font-medium text-brand-dark">
                        {selectedRows.length} selected
                      </span>
                      {bulkActions({
                        selectedRows,
                        clearSelection: () => setRowSelection({}),
                      })}
                    </div>
                  ) : null}
                  {toolbarActions}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 rounded-2xl border-border/60 bg-white/95 px-3.5 shadow-none hover:bg-brand-bg"
                    onClick={() => {
                      setGlobalFilter("");
                      setColumnFilters([]);
                      setSorting([]);
                      setRowSelection({});
                    }}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Reset
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="max-h-[calc(100vh-20rem)] overflow-auto px-2 py-2 md:px-3">
        <Table
          className={cn(
            rowSurface === "card" && "border-separate border-spacing-x-0 border-spacing-y-2.5",
          )}
        >
          <TableHeader className={cn(stickyHeader && "sticky top-0 z-10 bg-white")}>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className={cn(
                  "border-b border-border/40 bg-brand-surface/85 hover:bg-brand-surface/85",
                  rowSurface === "card" && "border-0 bg-transparent hover:bg-transparent",
                )}
              >
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDirection = header.column.getIsSorted();
                  return (
                    <TableHead
                      key={header.id}
                      className={cn(
                        "h-auto px-3 py-2.5 type-caption font-semibold uppercase tracking-[0.18em] text-brand-subtext md:px-4",
                        rowSurface === "card" && "bg-transparent px-4 pb-1.5 pt-0",
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1.5 text-left transition-colors hover:text-brand-dark"
                        >
                          <span>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {sortDirection === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : sortDirection === "desc" ? (
                            <ArrowDown className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={resolvedColumns.length} className="p-0">
                  <SkeletonTableRows rows={density === "compact" ? 7 : 5} />
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={resolvedColumns.length} className="p-0">
                  <EmptyState
                    icon={emptyIcon}
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                  />
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? "selected" : undefined}
                  className={cn(
                    "group/row border-border/30 transition-colors hover:bg-brand-bg/35",
                    density === "compact" ? "text-sm" : "",
                    rowSurface === "card" && "border-0 bg-transparent hover:bg-transparent",
                    onRowClick && "cursor-pointer",
                    rowClassName?.(row.original)
                  )}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "px-3 py-2.5 align-middle type-body-sm text-brand-ink-soft md:px-4",
                        density === "compact" && "py-2",
                        rowSurface === "card" &&
                          "border-y border-border/55 bg-white/96 py-3 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset] transition-colors group-hover/row:bg-brand-bg/45 first:rounded-l-[20px] first:border-l first:pl-4 last:rounded-r-[20px] last:border-r last:pr-4 md:first:pl-5 md:last:pr-5",
                        cellClassName?.(row.original)
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {!loading && table.getRowModel().rows.length > 0 ? (
        <div className="flex flex-col gap-2.5 border-t border-border/40 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,247,251,0.92))] px-3 py-3 md:flex-row md:items-center md:justify-between md:px-4">
          <p className="type-caption text-brand-subtext">
            Showing {table.getRowModel().rows.length} of {data.length} rows
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              Previous
            </Button>
            <span className="px-2 type-body-sm font-medium text-brand-dark">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
