import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell, Legend } from 'recharts';

interface ChannelDistributionPieProps {
  data: { channel: string; value: number }[];
}

const COLORS = ['#22c55e', '#fb923c'];

export function ChannelDistributionPie({ data }: ChannelDistributionPieProps) {
  return (
    <div
      className="w-full"
      style={{ minHeight: 200, height: 240, minWidth: 0 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="channel"
            innerRadius={50}
            outerRadius={70}
            paddingAngle={4}
          >
            {data.map((entry, index) => (
              <Cell key={entry.channel} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

