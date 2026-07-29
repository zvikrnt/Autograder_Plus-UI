import { ScatterChart, Scatter, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../../../ui/card";

export default function QuestionBenchmarkScatter({ points = [] }) {
  const me = points.filter((p) => p.is_me);
  const others = points.filter((p) => !p.is_me);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Time vs Score Benchmark</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px]">
        {points.length === 0 ? (
          <div className="text-sm text-gray-500">No benchmark data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" dataKey="x" name="Time" unit=" min" />
              <YAxis type="number" dataKey="y" name="Score" unit="%" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                formatter={(value, name) => {
                  if (name === "y") return [`${value}%`, "Score"];
                  if (name === "x") return [`${value} min`, "Time"];
                  return [value, name];
                }}
              />
              <Scatter data={others} fill="#94a3b8" />
              <Scatter data={me} fill="#2563eb" />
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
