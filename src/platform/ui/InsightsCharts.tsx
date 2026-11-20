"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// One accent (the brand primary) plus neutral greys, per the design direction.
const SERIES = ["var(--primary)", "var(--chart-3)", "var(--chart-2)", "var(--chart-4)", "var(--chart-5)", "var(--chart-1)"];
const AXIS = { fontSize: 11, fill: "var(--muted-foreground)" };
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: "1px solid var(--border)", background: "var(--popover)" };

export function PendingAgeChart({ data }: { data: Array<{ label: string; count: number }> }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={200}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "var(--muted)" }} contentStyle={TOOLTIP_STYLE} />
          <Bar dataKey="count" name="Pending" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={56} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ActionsPerDayChart({
  points,
  tools,
  labels,
}: {
  points: Array<Record<string, number | string>>;
  tools: string[];
  labels: Record<string, string>;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={200}>
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
          {tools.map((tool, i) => (
            <Line
              key={tool}
              type="monotone"
              dataKey={tool}
              name={labels[tool] ?? tool}
              stroke={SERIES[i % SERIES.length]}
              strokeWidth={i === 0 ? 2 : 1.5}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
