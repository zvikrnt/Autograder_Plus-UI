import { Card, CardContent, CardHeader, CardTitle } from "../../../ui/card";
import { Badge } from "../../../ui/badge";

export default function QuestionReportHeader({ assignment, overallRanking, visibility }) {
  const canView = visibility?.can_view_detailed_report;

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-xl">{assignment?.title || "Assignment Report"}</CardTitle>
          <Badge className={canView ? "bg-green-100 text-green-700 border-green-200" : "bg-amber-100 text-amber-700 border-amber-200"}>
            {canView ? "Graded" : "Pending"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
          <div className="text-gray-500 text-xs uppercase tracking-wide">Final Score</div>
          <div className="text-lg font-semibold text-gray-900">{assignment?.final_score ?? 0}%</div>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
          <div className="text-gray-500 text-xs uppercase tracking-wide">Overall Rank</div>
          <div className="text-lg font-semibold text-gray-900">
            {overallRanking?.rank ? `#${overallRanking.rank}` : "—"}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
          <div className="text-gray-500 text-xs uppercase tracking-wide">Percentile</div>
          <div className="text-lg font-semibold text-gray-900">
            {overallRanking?.percentile !== null && overallRanking?.percentile !== undefined
              ? `${overallRanking.percentile}%`
              : "—"}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
          <div className="text-gray-500 text-xs uppercase tracking-wide">Participants</div>
          <div className="text-lg font-semibold text-gray-900">{overallRanking?.participants ?? 0}</div>
        </div>
      </CardContent>
    </Card>
  );
}
