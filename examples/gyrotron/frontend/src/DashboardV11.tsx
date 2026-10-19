import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { api } from "./api";
import { FIXED_FIELDS } from "./types";

type Period = "30" | "90" | "365" | "all";

function PulseChart({ points, onSelect }: {
  points: { id: number; Serial: string; shot: string; iplen: string; date: string | null }[];
  onSelect: (id: number) => void;
}) {
  const valid = useMemo(() => points
    .map(p => ({ ...p, milliseconds: Number(p.iplen) }))
    .filter(p => Number.isFinite(p.milliseconds) && p.milliseconds > 0), [points]);
  if (!valid.length) return <div className="empty-small">该范围暂无有效脉宽数据</div>;

  const sorted = [...valid].sort((a, b) => a.milliseconds - b.milliseconds);
  const maximum = sorted[sorted.length - 1].milliseconds;
  const minimum = sorted[0].milliseconds;
  const median = sorted[Math.floor(sorted.length / 2)].milliseconds;
  const axisSeconds = Math.max(300, Math.ceil(maximum / 300000) * 300);
  const px = (milliseconds: number) => 60 + milliseconds / 1000 / axisSeconds * 880;
  const ticks = Array.from({ length: 6 }, (_, i) => axisSeconds * i / 5);
  const fmt = (milliseconds: number) => (milliseconds / 1000).toLocaleString("zh-CN", { maximumFractionDigits: 1 });

  // Smooth density depicts the complete data distribution without turning
  // thousands of overlapping bubbles into an opaque patch.
  const binCount = 50;
  const counts = Array.from({ length: binCount }, () => 0);
  sorted.forEach(p => { counts[Math.min(binCount - 1, Math.floor(p.milliseconds / 1000 / axisSeconds * binCount))]++; });
  const density = counts.map((_, i) => [1, 2, 3, 2, 1].reduce((sum, weight, j) =>
    sum + (counts[Math.min(binCount - 1, Math.max(0, i + j - 2))] || 0) * weight, 0) / 9);
  const maxDensity = Math.max(1, ...density);
  const wave = density.map(value => 22 + Math.sqrt(value / maxDensity) * 71);
  const centerY = 154;
  const polygon = [
    ...wave.map((height, i) => String(60 + (i + 0.5) * 880 / binCount) + "," + String(centerY - height)),
    ...wave.map((height, i) => String(60 + (i + 0.5) * 880 / binCount) + "," + String(centerY + height)).reverse(),
  ].join(" ");
  const featured = (id: number) => ((Math.imul(id, 2654435761) >>> 0) % 17) < 2;
  const positionY = (id: number, value: number) => {
    const hash = Math.imul(id, 1597334677) >>> 0;
    const band = Math.min(binCount - 1, Math.floor(value / 1000 / axisSeconds * binCount));
    const height = wave[band] * 0.86;
    return centerY + ((hash % 10000) / 9999 * 2 - 1) * height;
  };
  const radius = (value: number) => 1.35 + 6.7 * Math.sqrt(value / maximum);
  const color = (seconds: number) =>
    seconds / axisSeconds > .67 ? "#8277ce" : seconds / axisSeconds > .34 ? "#5a95cc" : "#63b1b5";
  const bubble = (p: typeof valid[number]) => {
    const prominent = featured(p.id);
    return <circle key={p.id} className={"pulse-dot " + (prominent ? "pulse-dot-featured" : "pulse-dot-soft")}
      cx={px(p.milliseconds)} cy={positionY(p.id, p.milliseconds)}
      r={radius(p.milliseconds)} fill={color(p.milliseconds / 1000)}
      fillOpacity={prominent ? ".44" : ".065"} stroke={prominent ? "#ffffff" : "none"}
      strokeOpacity=".8" strokeWidth={prominent ? ".7" : 0}
      tabIndex={prominent ? 0 : -1} role="button"
      aria-label={p.Serial + " 第" + p.shot + "炮，脉宽 " + p.iplen + "ms"}
      onClick={() => onSelect(p.id)}
      onKeyDown={event => { if (event.key === "Enter") onSelect(p.id); }}>
      <title>{p.Serial} / {p.shot} · {fmt(p.milliseconds)} s · {p.date || "无日期"}</title>
    </circle>;
  };
  return <div className="pulse-cloud-layout">
    <div className="pulse-cloud-metrics" aria-label="脉宽概况">
      <div><span>最短脉宽</span><strong>{fmt(minimum)} <small>s</small></strong></div>
      <div><span>中位脉宽</span><strong>{fmt(median)} <small>s</small></strong></div>
      <div><span>最长脉宽</span><strong>{fmt(maximum)} <small>s</small></strong></div>
    </div>
    <div className="pulse-scroll">
      <svg viewBox="0 0 1000 335" className="pulse-svg pulse-cloud" role="img"
        aria-label="脉宽分布气泡云图，线性秒数横轴，密度云轮廓与可点击的炮次气泡，脉宽越长气泡越大">
        <defs>
          <linearGradient id="pulse-surface" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7fbff" /><stop offset="100%" stopColor="#f7f7fd" />
          </linearGradient>
          <linearGradient id="pulse-haze" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#71c9c2" stopOpacity=".14"/>
            <stop offset="48%" stopColor="#8db8e8" stopOpacity=".24"/>
            <stop offset="100%" stopColor="#a49ce1" stopOpacity=".17"/>
          </linearGradient>
        </defs>
        <rect x="9" y="10" width="982" height="315" rx="16" fill="url(#pulse-surface)"/>
        {ticks.map(t => <g key={t}>
          <line x1={px(t * 1000)} x2={px(t * 1000)} y1="26" y2="268"
            stroke="#dfe8f4" strokeWidth="1" strokeDasharray={t ? "4 7" : "none"}/>
          <text x={px(t * 1000)} y="299" fontSize="12" textAnchor="middle"
            fill="#7586a0">{Math.round(t).toLocaleString("zh-CN")}</text>
        </g>)}
        <line x1="60" x2="940" y1={centerY} y2={centerY} stroke="#a9b7d4" strokeOpacity=".32" strokeDasharray="3 8"/>
        <polygon points={polygon} fill="url(#pulse-haze)" stroke="#8cafdc" strokeOpacity=".23" strokeWidth=".85"/>
        {sorted.filter(p => !featured(p.id)).map(bubble)}
        {sorted.filter(p => featured(p.id)).map(bubble)}
        <text x="500" y="321" textAnchor="middle" fill="#7183a0" fontSize="12">
          脉宽 (s)
        </text>
      </svg>
    </div>
  </div>;
}

export default function DashboardV11() {
  const [serial, setSerial] = useState("");
  const [period, setPeriod] = useState<Period>("365");
  const [detailId, setDetailId] = useState<number | null>(null);
  const data = useQuery({ queryKey: ["dashboard", serial], queryFn: () => api.dashboard(serial) });
  const detail = useQuery({ queryKey: ["shot", detailId], queryFn: () => api.get(detailId!), enabled: detailId !== null });
  const chart = useMemo(() => {
    const now = new Date();
    const cutoff = period === "all" ? 0 : new Date(now.getFullYear(), now.getMonth(), now.getDate() - Number(period)).getTime();
    const daily = data.data?.daily || [];
    const picked = daily.filter(p => new Date(p.date + "T00:00:00").getTime() >= cutoff);
    const granularity = period === "30" ? "day" : period === "90" ? "week" : "month";
    const totals = new Map<string, number>();
    picked.forEach(entry => {
      const dt = new Date(entry.date + "T00:00:00");
      let key = entry.date;
      if (granularity === "week") {
        const weekday = (dt.getDay() + 6) % 7;
        dt.setDate(dt.getDate() - weekday);
        key = dt.toLocaleDateString("en-CA");
      } else if (granularity === "month") key = entry.date.slice(0, 7);
      totals.set(key, (totals.get(key) || 0) + entry.count);
    });
    return [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count }));
  }, [data.data, period]);
  if (data.isPending) return <div className="loading-state">正在加载工作台...</div>;
  if (data.isError) return <div role="alert" className="form-error">{String(data.error)} <button onClick={() => void data.refetch()}>重试</button></div>;
  const info = data.data;
  const max = Math.max(1, ...info.by_serial.map(p => p.count));
  return <div className="v11-dashboard">
    <div className="v11-heading">
      <h1>实验工作台</h1>
      <div className="v11-filters">
        <select aria-label="工作台回旋管筛选" value={serial} onChange={e => setSerial(e.target.value)}>
          <option value="">全部 Serial</option>
          {info.by_serial.map(row => <option key={row.name} value={row.name}>{row.name}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={() => { setSerial(""); setPeriod("365"); }}>重置</button>
        <button className="btn btn-secondary" onClick={() => void data.refetch()}>刷新</button>
      </div>
    </div>
    <section className="v11-stats" aria-label="工作台三个统计指标">
      <div className="v11-card"><small>累计炮次</small><strong>{info.shots.toLocaleString("zh-CN")}</strong></div>
      <div className="v11-card"><small>回旋管数量（全系统）</small><strong>{info.serials.toLocaleString("zh-CN")}</strong></div>
      <div className="v11-card"><small>最近实验日期</small><strong>{info.latest_date || "暂无记录"}</strong></div>
    </section>
    <section className="v11-panel">
      <div className="v11-panel-heading"><h2>脉宽分布</h2></div>
      <PulseChart points={info.points} onSelect={setDetailId} />
      {info.missing_iplen > 0 && <div className="v11-muted">
        <Link to={"/records?iplen_state=missing" + (serial ? "&serial=" + encodeURIComponent(serial) : "")}>
          {info.missing_iplen} 炮无有效脉宽
        </Link>
      </div>}
    </section>
    <div className="v11-chart-grid">
      <section className="v11-panel"><div className="v11-panel-heading"><h2>回旋管炮次数量分布</h2></div>
        <div className="v11-bars" role="group" aria-label="按 Serial 切换工作台">
          {info.by_serial.map(row => <button key={row.name} title={"选中 " + row.name} onClick={() => setSerial(row.name)}
            className={"v11-bar-item " + (row.name === serial ? "active" : "")}>
            <span className="v11-bar-count">{row.count}</span>
            <span className="v11-bar-column" style={{ height: Math.max(4, row.count / max * 155) }} />
            <span className="v11-bar-label">{row.name.startsWith("TEST-SYNTH-GYRO-")
              ? row.name.slice(-2) : row.name.length > 9 ? row.name.slice(0, 8) + "…" : row.name}</span>
          </button>)}
          {!info.by_serial.length && <p>暂无实验记录</p>}
        </div>
      </section>
      <section className="v11-panel"><div className="v11-panel-heading"><h2>实验时间趋势</h2>
        <div className="v11-periods">{([["30","30天"],["90","90天"],["365","12个月"],["all","全部历史"]] as const).map(([value, label]) =>
          <button key={value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>{label}</button>)}</div></div>
        <div style={{ height: 237 }}>
          {chart.length ? <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart} margin={{ top: 12, right: 17, left: -24, bottom: 5 }}>
              <CartesianGrid vertical={false} stroke="#edf0f5" strokeDasharray="3 6" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(value) => [value, "炮次数"]} />
              <Line dataKey="count" stroke="#6386cd" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer> : <div className="empty-small">该时间范围暂无实验</div>}
        </div>
      </section>
    </div>
    {detailId !== null && <div className="v11-drawer-scrim" onClick={() => setDetailId(null)}>
      <aside className="v11-drawer" onClick={event => event.stopPropagation()} aria-label="炮次详情">
        <div className="v11-panel-heading"><h2>炮次详情</h2><button onClick={() => setDetailId(null)}>关闭</button></div>
        {detail.isPending ? <p>正在加载详情...</p> : detail.isError ? <p role="alert">详情加载失败</p> : <>
          <h3>{detail.data.Serial} / {detail.data.shot}</h3><p>实验日期：{detail.data.date}</p>
          <dl>{FIXED_FIELDS.map(field => <div key={field.key}><dt>{field.label} ({field.unit})</dt><dd>{detail.data[field.key] ?? "未填写"}</dd></div>)}</dl>
          <h3>自定义参数</h3>{detail.data.custom_parameters?.map(p =>
            <p key={p.id ?? p.name}>{p.name}（{p.description || "无含义"}）：{p.value ?? "未填写"} {p.unit}</p>)}
          <p>备注：{detail.data.remark || "无"}</p>
          <Link className="btn btn-primary" to={"/records/" + detailId + "/edit"}>编辑此炮次</Link>
        </>}
      </aside>
    </div>}
  </div>;
}
