import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface RejectionValueVsQuantityChartProps {
  data: { channel: string; value: number }[];
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
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar
            dataKey="value"
            name="Rejected quantity"
            fill="#4f46e5"
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

