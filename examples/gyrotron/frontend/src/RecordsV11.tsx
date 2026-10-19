import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "./api";
import { FIXED_FIELDS, type FixedKey, type Shot } from "./types";

const defaultColumns: FixedKey[] = ["iplen", "Uc", "Ib", "Im"];
const dateLabels = ["Serial", "shot", "date"];
type FilterCondition = {
  name: string; operator: "contains" | "eq" | "gt" | "gte" | "lt" | "lte";
  value: string; data_type: "DECIMAL" | "DATE" | "TEXT";
};

export default function RecordsV11() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const serials = useQuery({ queryKey: ["serials"], queryFn: api.serials });
  const client = useQueryClient();
  const serial = params.get("serial") || "";
  const [advanced, setAdvanced] = useState(false);
  const [columns, setColumns] = useState<FixedKey[]>(() => {
    try { return JSON.parse(localStorage.getItem("gyrotron-fixed-columns") || "null") || defaultColumns; }
    catch { return defaultColumns; }
  });
  const suggestions = useQuery({ queryKey: ["suggestions", serial], queryFn: () => api.suggestions(serial), enabled: !!serial });
  const [customCols, setCustomCols] = useState<string[]>([]);
  const [activeCell, setActiveCell] = useState<{ id: number; column: number } | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [scroll, setScroll] = useState(0);
  const scrollBox = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [colSettings, setColSettings] = useState(false);
  const [compact, setCompact] = useState(() => localStorage.getItem("gyrotron-density") === "compact");
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" }>({ field: "shot", direction: "desc" });
  useEffect(() => {
    if (serial || !serials.data?.length) return;
    const old = localStorage.getItem("gyrotron-current-serial");
    const preferred = old && serials.data.some(s => s.name === old) ? old : serials.data[0].name;
    setParams(previous => { const copy = new URLSearchParams(previous); copy.set("serial", preferred); return copy; }, { replace: true });
  }, [serial, serials.data, setParams]);
  useEffect(() => {
    if (serial) localStorage.setItem("gyrotron-current-serial", serial);
    try { setCustomCols(JSON.parse(localStorage.getItem("gyrotron-custom-cols-" + serial) || "[]")); }
    catch { setCustomCols([]); }
    setActiveCell(null); setSelected([]); setScroll(0);
    if (scrollBox.current) scrollBox.current.scrollTop = 0;
  }, [serial]);
  const customConditions = useMemo((): FilterCondition[] => {
    try {
      const parsed = JSON.parse(params.get("custom_filters") || "[]") as FilterCondition[];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }, [params]);
  const filters = useMemo(() => {
    const result: Record<string, string> = {};
    for (const key of ["serial", "shot", "date_from", "date_to", "iplen_state", "search"]) {
      if (params.get(key)) result[key] = params.get(key)!;
    }
    for (const field of FIXED_FIELDS) {
      for (const suffix of ["_min", "_max"]) {
        const key = field.key + suffix;
        if (params.get(key)) result[key] = params.get(key)!;
      }
    }
    const active = customConditions.filter(row => row.name.trim());
    if (active.length) result.custom_filters = JSON.stringify(active);
    result.sort = sort.field;
    result.order = sort.direction;
    return result;
  }, [params, customConditions, sort]);
  const listing = useInfiniteQuery({
    queryKey: ["shots", filters], initialPageParam: 1,
    queryFn: ({ pageParam }) => api.filtered(filters, pageParam as number),
    getNextPageParam: (last, pages) => pages.reduce((sum, p) => sum + p.items.length, 0) < last.total ? pages.length + 1 : undefined,
    enabled: !!serial,
  });
  const items = listing.data?.pages.flatMap(page => page.items) || [];
  const rows = items;  // Server sorts the complete filtered result before paging.
  const cols = columns.filter(key => FIXED_FIELDS.some(f => f.key === key));
  const total = listing.data?.pages[0]?.total ?? 0;
  const rowHeight = compact ? 36 : 44;
  const start = Math.max(0, Math.floor(scroll / rowHeight) - 8);
  const visible = rows.slice(start, start + 32);
  const colCount = 5 + cols.length + customCols.length;
  const selectableColumns = 3 + cols.length + customCols.length;
  function cellValue(row: Shot, column: number): string {
    if (column === 0) return row.Serial;
    if (column === 1) return row.shot;
    if (column === 2) return row.date ?? "";
    if (column < 3 + cols.length) return row[cols[column - 3]] ?? "";
    const name = customCols[column - 3 - cols.length];
    const entry = row.custom_parameters?.find(p => p.name === name);
    return entry ? entry.value ?? "" : "";
  }
  function onGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName) || target.isContentEditable) return;
    if (!activeCell) return;
    const current = rows.findIndex(row => row.id === activeCell.id);
    if (current < 0) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
      const value = cellValue(rows[current], activeCell.column);
      if (navigator.clipboard?.writeText) {
        event.preventDefault();
        void navigator.clipboard.writeText(value).catch(() => {});
      }
      return;
    }
    if (event.key === "Enter") { event.preventDefault(); navigate("/records/" + rows[current].id + "/edit"); return; }
    const offsets: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const nextRow = Math.max(0, Math.min(rows.length - 1, current + offset[0]));
    const nextColumn = Math.max(0, Math.min(selectableColumns - 1, activeCell.column + offset[1]));
    setActiveCell({ id: rows[nextRow].id, column: nextColumn });
    if (scrollBox.current) {
      const offsetY = nextRow * rowHeight;
      if (offsetY < scrollBox.current.scrollTop) scrollBox.current.scrollTop = offsetY;
      else if (offsetY + rowHeight > scrollBox.current.scrollTop + scrollBox.current.clientHeight) {
        scrollBox.current.scrollTop = offsetY + rowHeight - scrollBox.current.clientHeight;
      }
    }
  }
  function setFilter(key: string, value: string) {
    setParams(previous => { const next = new URLSearchParams(previous); if (value) next.set(key, value); else next.delete(key); return next; });
  }
  function changeSerial(value: string) {
    setParams(previous => { const next = new URLSearchParams(previous); next.set("serial", value); return next; });
  }
  function setCustomConditions(next: FilterCondition[]) {
    setParams(previous => {
      const updated = new URLSearchParams(previous);
      if (next.length) updated.set("custom_filters", JSON.stringify(next));
      else updated.delete("custom_filters");
      return updated;
    });
  }
  function changeCustom(index: number, key: keyof FilterCondition, value: string) {
    setCustomConditions(customConditions.map((item, i) => i === index ? { ...item, [key]: value } : item));
  }
  function toggleColumn(key: FixedKey) {
    const update = columns.includes(key) ? columns.filter(k => k !== key) : [...columns, key];
    setColumns(update); localStorage.setItem("gyrotron-fixed-columns", JSON.stringify(update));
  }
  function toggleCustom(name: string) {
    const update = customCols.includes(name) ? customCols.filter(c => c !== name) : [...customCols, name];
    setCustomCols(update); localStorage.setItem("gyrotron-custom-cols-" + serial, JSON.stringify(update));
  }
  async function deleteFiltered(onlySelected = false) {
    const requestFilters: Record<string, unknown> = { ...filters };
    if (onlySelected) requestFilters.ids = selected;
    try {
      setBusy("正在确认删除范围...");
      const preview = await api.deletePreview(requestFilters);
      if (preview.count === 0) { setBusy(""); return; }
      if (!window.confirm("即将永久删除 " + preview.count + " 炮记录及其自定义参数。\nSerial：" + serial +
          "\n筛选：" + JSON.stringify(requestFilters) + "\n此操作无法撤销，确定继续？")) {
        setBusy(""); return;
      }
      setBusy("正在删除...");
      await api.bulkDelete(requestFilters, preview.snapshot);
      setSelected([]);
      await Promise.all([client.invalidateQueries({ queryKey: ["shots"] }),
        client.invalidateQueries({ queryKey: ["dashboard"] }), client.invalidateQueries({ queryKey: ["serials"] })]);
      setBusy("");
    } catch (err) { setError(String(err)); setBusy(""); }
  }
  const busyLoading = listing.isPending || (listing.isFetching && !listing.data);
  return <div className="v11-records">
    <div className="v11-heading"><h1>炮次记录</h1>
      <Link className="btn btn-primary" to={"/records/new?serial=" + encodeURIComponent(serial)}>+ 新增炮次</Link></div>
    <section className="v11-toolbar">
      <label>回旋管 <select aria-label="选择 Serial" value={serial} onChange={e => changeSerial(e.target.value)}>
        {!serial && <option value="">选择 Serial</option>}
        {serials.data?.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
      </select></label>
      <label>炮号 <input placeholder="精确炮号" value={params.get("shot") || ""} onChange={e => setFilter("shot", e.target.value)} /></label>
      <button className="btn btn-secondary" onClick={() => setAdvanced(!advanced)}>{advanced ? "收起高级筛选" : "高级筛选"}</button>
      <button className="btn btn-secondary" onClick={() => setColSettings(!colSettings)}>列设置</button>
      <button className="btn btn-secondary" onClick={() => void listing.refetch()}>刷新</button>
    </section>
    {advanced && <section className="v11-toolbar v11-advanced">
      <label>开始日期<input type="date" value={params.get("date_from") || ""} onChange={e => setFilter("date_from", e.target.value)} /></label>
      <label>结束日期<input type="date" value={params.get("date_to") || ""} onChange={e => setFilter("date_to", e.target.value)} /></label>
      <label>脉宽状态<select value={params.get("iplen_state") || ""} onChange={e => setFilter("iplen_state", e.target.value)}>
        <option value="">全部</option><option value="positive">正脉宽</option><option value="missing">非正或缺失</option></select></label>
      <details className="v11-range-filters">
        <summary>九项固定参数区间筛选</summary>
        <div>{FIXED_FIELDS.map(field => <div className="v11-range-item" key={field.key}>
          <span>{field.label} ({field.unit})</span>
          <input aria-label={field.label + "下限"} placeholder="最小" value={params.get(field.key + "_min") || ""} onChange={e => setFilter(field.key + "_min", e.target.value)} />
          <input aria-label={field.label + "上限"} placeholder="最大" value={params.get(field.key + "_max") || ""} onChange={e => setFilter(field.key + "_max", e.target.value)} />
        </div>)}</div>
      </details>
      <div className="v11-custom-filters">
        <div className="v11-custom-heading"><strong>自定义参数条件（多个条件同时满足）</strong>
          <button type="button" className="btn btn-secondary" disabled={customConditions.length >= 10}
            onClick={() => setCustomConditions([...customConditions, { name: "", operator: "contains", value: "", data_type: "TEXT" }])}>
            + 添加条件</button></div>
        <datalist id="v11-filter-suggestions">{suggestions.data?.map(entry => <option key={entry.name} value={entry.name} />)}</datalist>
        {customConditions.map((item, index) => <div className="v11-filter-line" key={index}>
          <input aria-label={"条件" + (index + 1) + "参数名称"} list="v11-filter-suggestions" placeholder="参数名称" value={item.name} onChange={e => changeCustom(index, "name", e.target.value)} />
          <select aria-label={"条件" + (index + 1) + "值类型"} value={item.data_type}
            onChange={e => changeCustom(index, "data_type", e.target.value)}>
            <option value="TEXT">文本</option><option value="DECIMAL">数值</option><option value="DATE">日期</option>
          </select>
          <select aria-label={"条件" + (index + 1) + "比较方式"} value={item.operator}
            onChange={e => changeCustom(index, "operator", e.target.value)}>
            <option value="contains">包含</option><option value="eq">等于</option>
            <option value="gt">大于 / 晚于</option><option value="gte">大于等于</option>
            <option value="lt">小于 / 早于</option><option value="lte">小于等于</option>
          </select>
          <input aria-label={"条件" + (index + 1) + "参数值"} type={item.data_type === "DATE" ? "date" : "text"}
            value={item.value} placeholder="参数值" onChange={e => changeCustom(index, "value", e.target.value)} />
          <button type="button" className="btn btn-secondary" onClick={() =>
            setCustomConditions(customConditions.filter((_, i) => i !== index))}>删除</button>
        </div>)}
      </div>
      <button className="btn btn-secondary" onClick={() => {
        setParams({ serial });
      }}>清空筛选</button>
    </section>}
    {colSettings && <section className="v11-toolbar v11-cols">
      <strong>固定参数列</strong>{FIXED_FIELDS.map(f => <label key={f.key}>
        <input type="checkbox" checked={cols.includes(f.key)} onChange={() => toggleColumn(f.key)} />{f.label}</label>)}
      <strong>自定义参数列（按 Serial 记忆）</strong>
      {suggestions.data?.map(item => <label key={item.name}>
        <input type="checkbox" checked={customCols.includes(item.name)} onChange={() => toggleCustom(item.name)} />{item.name}</label>)}
      <label><input type="checkbox" checked={compact} onChange={e => {
        setCompact(e.target.checked); localStorage.setItem("gyrotron-density", e.target.checked ? "compact" : "comfortable");
      }} />紧凑行高</label>
    </section>}
    <section className="v11-toolbar v11-actions">
      <span>当前条件共 <strong>{total}</strong> 炮 · 已加载 {items.length} 炮</span>
      <div>
        <a className="btn btn-secondary" href={api.exportURL(filters, "xlsx")}>导出 Excel</a>
        <a className="btn btn-secondary" href={api.exportURL(filters, "csv")}>导出 CSV ZIP</a>
        <button className="btn btn-secondary" disabled={!selected.length || !!busy} onClick={() => void deleteFiltered(true)}>删除选中 ({selected.length})</button>
        <button className="btn btn-secondary v11-danger" disabled={!total || !!busy} onClick={() => void deleteFiltered()}>删除全部筛选结果</button>
      </div>
    </section>
    {busy && <p role="status">{busy}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    {listing.isError && <p className="form-error">加载失败：{String(listing.error)}</p>}
    <div className={"v11-table-viewport " + (compact ? "v11-compact" : "")} ref={scrollBox}
      tabIndex={0} aria-label="炮次记录表：方向键移动单元格，回车编辑，Ctrl 或 Command 加 C 复制当前值" onKeyDown={onGridKeyDown}
      onScroll={event => {
        const target = event.currentTarget;
        setScroll(target.scrollTop);
        if (target.scrollTop + target.clientHeight >= target.scrollHeight - 350 && listing.hasNextPage && !listing.isFetchingNextPage) {
          void listing.fetchNextPage();
        }
      }}>
      <table className="v11-table"><thead><tr>
        <th className="v11-pin"><input type="checkbox" aria-label="选择已加载炮次" checked={!!items.length && selected.length === items.length}
          onChange={e => setSelected(e.target.checked ? items.map(row => row.id) : [])} /></th>
        {dateLabels.map(label => <th key={label} className={label === "Serial" || label === "shot" ? "v11-pin" : ""}>
          {label === "Serial" ? "Serial" : <button onClick={() => setSort(previous => ({field: label, direction: previous.field === label && previous.direction === "desc" ? "asc" : "desc"}))}>{label === "shot" ? "shot" : "日期"} {sort.field === label ? sort.direction === "desc" ? "↓" : "↑" : ""}</button>}</th>)}
        {cols.map(key => <th key={key}><button onClick={() => setSort(previous => ({field: key, direction: previous.field === key && previous.direction === "desc" ? "asc" : "desc"}))}>{FIXED_FIELDS.find(f => f.key === key)?.label} ({FIXED_FIELDS.find(f => f.key === key)?.unit}) {sort.field === key ? sort.direction === "desc" ? "↓" : "↑" : ""}</button></th>)}
        {customCols.map(name => <th key={name}>{name}</th>)}<th>操作</th>
      </tr></thead><tbody>
        {start > 0 && <tr aria-hidden="true"><td colSpan={colCount} style={{ padding: 0, height: start * rowHeight }} /></tr>}
        {visible.map(row => <FragmentRow key={row.id} row={row} cols={cols} customCols={customCols}
          selected={selected.includes(row.id)} toggle={() => setSelected(p => p.includes(row.id) ? p.filter(id => id !== row.id) : [...p, row.id])}
          activeCol={activeCell?.id === row.id ? activeCell.column : null}
          selectCell={column => { setActiveCell({ id: row.id, column }); scrollBox.current?.focus({ preventScroll: true }); }}
          />)}
        {rows.length > start + visible.length && <tr aria-hidden="true"><td colSpan={colCount} style={{ padding: 0, height: (rows.length - start - visible.length) * rowHeight }} /></tr>}
      </tbody></table>
      {busyLoading && <div className="loading-state">正在加载炮次...</div>}
      {listing.isFetchingNextPage && <div className="v11-muted">正在继续加载...</div>}
      {listing.data && total === 0 && <div className="empty-small">没有符合条件的炮次</div>}
    </div>
  </div>;
}

function FragmentRow({ row, cols, customCols, selected, toggle, activeCol, selectCell }: {
  row: Shot; cols: FixedKey[]; customCols: string[];
  selected: boolean; toggle: () => void;
  activeCol: number | null; selectCell: (column: number) => void;
}) {
  return <tr data-shot-id={row.id}>
      <td className="v11-pin"><input type="checkbox" aria-label={"选择第" + row.shot + "炮"} checked={selected} onChange={toggle} /></td>
      <td className={"v11-pin " + (activeCol === 0 ? "v11-active-cell" : "")} onClick={() => selectCell(0)}>{row.Serial}</td>
      <td className={"v11-pin " + (activeCol === 1 ? "v11-active-cell" : "")} onClick={() => selectCell(1)}>{row.shot}</td>
      <td className={activeCol === 2 ? "v11-active-cell" : ""} onClick={() => selectCell(2)}>{row.date || "—"}</td>
      {cols.map((key, index) => <td key={key} className={activeCol === index + 3 ? "v11-active-cell" : ""}
        onClick={() => selectCell(index + 3)}>{row[key] ?? "—"}</td>)}
      {customCols.map((name, index) => {
        const p = row.custom_parameters?.find(item => item.name === name);
        return <td key={name} className={activeCol === index + cols.length + 3 ? "v11-active-cell" : ""}
          onClick={() => selectCell(index + cols.length + 3)}>{!p ? "未添加" : p.value === null || p.value === "" ? "未填写" : p.value}</td>;
      })}
      <td><Link className="v11-cell-action" to={"/records/" + row.id + "/edit"}>完整编辑</Link></td>
  </tr>;
}
