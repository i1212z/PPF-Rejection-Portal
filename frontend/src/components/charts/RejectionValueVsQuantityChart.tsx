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

interface RejectionValueVsQuantityChartProps {
  data: { channel: string; value: number; quantity: number; unit?: string }[];
}

export function RejectionValueVsQuantityChart({
  data,
}: RejectionValueVsQuantityChartProps) {
  return (
    <div
      className="w-full"
      style={{ minHeight: 200, height: 240, minWidth: 0 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="channel" tickLine={false} axisLine={false} />
          <YAxis
            yAxisId="left"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 10 }}
          />
          <Tooltip
            formatter={(value, name, entry: any) => {
              const num = typeof value === 'number' ? value : Number(value ?? 0);
              const unit = entry?.payload?.unit || '';
              return [`${num}${unit ? ` ${unit}` : ''}`, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            yAxisId="left"
            dataKey="value"
            name="Quantity"
            fill="#4f46e5"
            radius={[6, 6, 0, 0]}
          />
          <Bar
            yAxisId="right"
            dataKey="quantity"
            name="Quantity"
            fill="#0f766e"
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

