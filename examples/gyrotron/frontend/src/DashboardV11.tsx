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
  if (!points.length) return <div className="empty-small">该范围没有可绘制的正脉宽数据</div>;
  const values = points.map(p => Number(p.iplen)).filter(v => Number.isFinite(v) && v > 0);
  if (!values.length) return <div className="empty-small">暂无有效脉宽数据</div>;
  const lo = Math.floor(Math.log10(Math.min(...values)));
  const hi = Math.ceil(Math.log10(Math.max(...values))) || lo + 1;
  const span = Math.max(1, hi - lo);
  const x = (value: number) => 48 + (Math.log10(value) - lo) / span * 890;
  const ticks = Array.from({ length: hi - lo + 1 }, (_, i) => Math.pow(10, lo + i));
  const positionY = (id: number) => 145 + (((id * 2654435761) >>> 0) % 1000 / 1000 - .5) * 170;
  return <div className="pulse-scroll"><svg viewBox="0 0 1000 295" className="pulse-svg" role="img"
    aria-label="脉宽分布蜂群散点图，横轴为脉宽毫秒的对数坐标，纵向抖动没有物理意义">
    {ticks.map(t => <g key={t}>
      <line x1={x(t)} x2={x(t)} y1="19" y2="260" stroke="#e9eef5" strokeDasharray="3 5" />
      <text x={x(t)} y="284" fontSize="11" textAnchor="middle" fill="#8190a5">{t.toExponential(0)}</text>
    </g>)}
    <line x1="48" y1="260" x2="938" y2="260" stroke="#b5c2d6" />
    {points.map(p => {
      const value = Number(p.iplen);
      return <circle key={p.id} className="pulse-dot" cx={x(value)} cy={positionY(p.id)} r={3.7}
        fill={value >= 700000 ? "#ee923b" : "#547bd9"} fillOpacity=".8" tabIndex={0}
        role="button" aria-label={p.Serial + " 第" + p.shot + "炮，脉宽 " + p.iplen + "ms"}
        onClick={() => onSelect(p.id)}
        onKeyDown={event => { if (event.key === "Enter") onSelect(p.id); }}>
        <title>{p.Serial} / {p.shot} · {p.iplen} ms · {p.date || "无日期"}</title>
      </circle>;
    })}
    <text x="498" y="294" textAnchor="middle" fill="#7184a0" fontSize="10">iplen (ms) · 对数坐标</text>
  </svg></div>;
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
      <div><h1>实验工作台</h1><p>回旋管运行参数 · 历史数据分析</p></div>
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
      <div className="v11-panel-heading"><div><h2>脉宽分布</h2><p>每炮一个点；纵向抖动不代表物理参数</p></div>
        <span>共 {info.points.length} 个可绘制点</span></div>
      <PulseChart points={info.points} onSelect={setDetailId} />
      <div className="v11-muted">{info.missing_iplen} 炮因脉宽为空或 ≤ 0 未绘制。
        {info.missing_iplen > 0 && <Link to={"/records?iplen_state=missing" + (serial ? "&serial=" + encodeURIComponent(serial) : "")}>查看未绘制炮次</Link>}</div>
    </section>
    <div className="v11-chart-grid">
      <section className="v11-panel"><div className="v11-panel-heading"><h2>回旋管炮次数量分布</h2><span>全部历史，降序</span></div>
        <div className="v11-bars" role="group" aria-label="按 Serial 切换工作台">
          {info.by_serial.map(row => <button key={row.name} title={"选中 " + row.name} onClick={() => setSerial(row.name)}
            className={"v11-bar-item " + (row.name === serial ? "active" : "")}>
            <span className="v11-bar-count">{row.count}</span>
            <span className="v11-bar-column" style={{ height: Math.max(4, row.count / max * 155) }} />
            <span className="v11-bar-label">{row.name}</span>
          </button>)}
          {!info.by_serial.length && <p>暂无炮次记录</p>}
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
