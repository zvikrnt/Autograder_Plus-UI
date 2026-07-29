import { Card, CardContent, CardHeader, CardTitle } from "../../../ui/card";

export default function QuestionErrorHeatmap({ data = [], studentResults = [] }) {
  const isLongList = data.length > 6;
  const normalizeErrorType = (type) => (type === "Unknown Error" ? "Output Mismatch" : type);
  const studentStatusByCase = new Map(
    (studentResults || []).flatMap((result, idx) => {
      const canonical = String(result?.canonical_test_case_id || "");
      const raw = String(result?.test_case_id || `tc_${idx + 1}`);
      const status = result?.status || null;
      return canonical
        ? [[canonical, status], [raw, status]]
        : [[raw, status]];
    })
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Class Test-Case Heatmap</CardTitle>
        <p className="text-xs text-gray-500">
          Shows class pass rate for each test case (latest attempt per student), with your result beside it.
        </p>
      </CardHeader>
      <CardContent className={isLongList ? "space-y-3 max-h-[420px] overflow-y-auto pr-1" : "space-y-3"}>
        {data.length === 0 ? (
          <div className="text-sm text-gray-500">No error data available for this question.</div>
        ) : (
          data.map((item, idx) => {
            const caseKey = String(item.test_case_id || `tc_${idx + 1}`);
            const myStatus = studentStatusByCase.get(caseKey) || studentStatusByCase.get(`tc_${idx + 1}`) || null;

            return (
              <div key={caseKey} className={`border rounded-lg p-3 ${myStatus === "fail" ? "border-red-200 bg-red-50/30" : "border-gray-100"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium text-gray-900">{item.name}</div>
                  <div className="flex items-center gap-2">
                    <div className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${item.pass_rate >= 70 ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100"}`}>
                      Class: {item.pass_rate}%
                    </div>
                    <div className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      myStatus === "pass"
                        ? "text-green-700 bg-green-100"
                        : myStatus === "fail"
                        ? "text-red-700 bg-red-100"
                        : "text-gray-600 bg-gray-100"
                    }`}>
                      You: {myStatus || "n/a"}
                    </div>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full ${item.pass_rate >= 70 ? "bg-green-500" : "bg-red-500"}`}
                    style={{ width: `${Math.max(0, Math.min(100, item.pass_rate || 0))}%` }}
                  />
                </div>
                {item.top_errors?.length > 0 && (
                  <div className="mt-2 text-xs text-gray-600">
                    Top errors: {item.top_errors.map((e) => `${normalizeErrorType(e.type)} (${e.count})`).join(", ")}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
