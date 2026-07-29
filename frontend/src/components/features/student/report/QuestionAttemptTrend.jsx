import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../../../ui/card";

export default function QuestionAttemptTrend({ data = [] }) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Attempt Trend</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px]">
        {data.length === 0 ? (
          <div className="text-sm text-gray-500">No attempt history available.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="attempt_number" label={{ value: "Attempt", position: "insideBottom", offset: -10 }} />
              <YAxis domain={[0, 100]} label={{ value: "Score", angle: -90, position: "insideLeft" }} />
              <Tooltip formatter={(value) => [`${value}%`, "Score"]} />
              <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
