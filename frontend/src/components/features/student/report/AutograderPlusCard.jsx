import { Card, CardContent, CardHeader, CardTitle } from "../../../ui/card";

function renderSafeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export default function AutograderPlusCard({ submissionSnapshot, insights }) {
  const aiData = submissionSnapshot?.ai_analysis_data || {};
  const feedback = (aiData && typeof aiData.feedback === "object") ? aiData.feedback : aiData;

  const technicalSummary = renderSafeValue(feedback?.technical_summary);
  const errorExplanation = renderSafeValue(feedback?.error_explanation);
  const identifiedConcepts = Array.isArray(feedback?.identified_concepts) ? feedback.identified_concepts : [];
  const recommended = insights?.improvement_scope?.recommended_actions || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Autograder+ Insights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {technicalSummary ? (
          <div className="p-3 rounded-lg border border-gray-100 bg-gray-50">
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Technical Summary</div>
            <div className="text-gray-800 whitespace-pre-wrap">{technicalSummary}</div>
          </div>
        ) : null}

        {errorExplanation ? (
          <div className="p-3 rounded-lg border border-red-100 bg-red-50">
            <div className="text-xs uppercase tracking-wide text-red-600 mb-1">Error Explanation</div>
            <div className="text-red-700 whitespace-pre-wrap">{errorExplanation}</div>
          </div>
        ) : null}

        {identifiedConcepts.length > 0 ? (
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Identified Concepts</div>
            <div className="flex flex-wrap gap-2">
              {identifiedConcepts.map((item, idx) => (
                <span key={idx} className="px-2 py-1 rounded-md text-xs bg-blue-50 text-blue-700 border border-blue-100">
                  {typeof item === "string" ? item : JSON.stringify(item)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {recommended.length > 0 ? (
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Improvement Scope</div>
            <ul className="list-disc pl-5 space-y-1 text-gray-700">
              {recommended.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-gray-500">No additional AI insights available for this question.</div>
        )}
      </CardContent>
    </Card>
  );
}
