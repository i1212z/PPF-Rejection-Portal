import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface ApprovedRejectedPoint {
  name: string;
  value: number;
  count: number;
}

interface ApprovedVsRejectedChartProps {
  data: ApprovedRejectedPoint[];
}

export function ApprovedVsRejectedChart({ data }: ApprovedVsRejectedChartProps) {
  return (
    <div className="w-full" style={{ minHeight: 200, height: 224 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10 }}
          />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            yAxisId="left"
            dataKey="value"
            name="Ticket value"
            fill="#4f46e5"
            radius={[6, 6, 0, 0]}
          />
          <Bar
            yAxisId="right"
            dataKey="count"
            name="Quantity"
            fill="#0f766e"
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
