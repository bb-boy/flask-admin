export type ParameterType = "DECIMAL" | "BIGINT" | "STRING" | "TEXT" | "DATE";

export interface CustomParameter {
  id?: number;
  name: string;
  description: string;
  unit: string;
  data_type: ParameterType;
  value: string;
}

export interface Shot {
  id: number;
  Serial: string;
  shot: string;
  date: string | null;
  remark: string | null;
  iplen: string | null;
  Uc: string | null;
  Ua: string | null;
  Ib: string | null;
  Im: string | null;
  Pf: string | null;
  Ic: string | null;
  Pw: string | null;
  Pc: string | null;
  custom_parameters?: CustomParameter[];
}

export type ShotForm = Omit<Shot, "id">;
export type FixedKey = "iplen" | "Uc" | "Ua" | "Ib" | "Im" | "Pf" | "Ic" | "Pw" | "Pc";

export interface DashboardData {
  shots: number;
  serials: number;
  parameters: number;
  latest_date: string | null;
  recent: Shot[];
  by_serial: { name: string; count: number }[];
}

export interface ShotPage {
  items: Shot[];
  total: number;
  page: number;
  page_size: number;
}

export const FIXED_FIELDS: { key: FixedKey; label: string; unit: string; group: string }[] = [
  { key: "iplen", label: "脉冲宽度", unit: "ms", group: "脉冲与电压" },
  { key: "Uc", label: "阴极电压", unit: "kV", group: "脉冲与电压" },
  { key: "Ua", label: "阳极电压", unit: "kV", group: "脉冲与电压" },
  { key: "Ib", label: "阴极电流", unit: "A", group: "电流与磁场" },
  { key: "Im", label: "磁场电流", unit: "A", group: "电流与磁场" },
  { key: "Ic", label: "阴极线圈电流", unit: "A", group: "电流与磁场" },
  { key: "Pf", label: "灯丝功率", unit: "W", group: "功率监测" },
  { key: "Pw", label: "水负载功率", unit: "kW", group: "功率监测" },
  { key: "Pc", label: "收集极功率", unit: "kW", group: "功率监测" },
];

export const PARAMETER_TYPES: { value: ParameterType; label: string }[] = [
  { value: "DECIMAL", label: "小数" },
  { value: "BIGINT", label: "整数" },
  { value: "STRING", label: "短文本" },
  { value: "TEXT", label: "长文本" },
  { value: "DATE", label: "日期" },
];

export const blankParameter = (): CustomParameter => ({
  name: "", description: "", unit: "", data_type: "DECIMAL", value: "",
});

export const blankShot = (): ShotForm => ({
  Serial: "", shot: "", date: new Date().toLocaleDateString("en-CA"),
  remark: "", iplen: "", Uc: "", Ua: "", Ib: "", Im: "", Pf: "", Ic: "", Pw: "", Pc: "",
  custom_parameters: [],
});
