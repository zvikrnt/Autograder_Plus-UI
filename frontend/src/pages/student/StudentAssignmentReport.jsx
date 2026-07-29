import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Loader2 } from "lucide-react";

import StudentLayout from "../../components/layout/StudentLayout";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { submissionService } from "../../services/submissionService";

import QuestionReportHeader from "../../components/features/student/report/QuestionReportHeader";
import QuestionErrorHeatmap from "../../components/features/student/report/QuestionErrorHeatmap";
import QuestionBenchmarkScatter from "../../components/features/student/report/QuestionBenchmarkScatter";
import QuestionAttemptTrend from "../../components/features/student/report/QuestionAttemptTrend";
import AutograderPlusCard from "../../components/features/student/report/AutograderPlusCard";

export default function StudentAssignmentReport() {
  const { assignmentId } = useParams();

  const [summary, setSummary] = useState(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState(null);
  const [detailsByQuestionId, setDetailsByQuestionId] = useState({});
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState(null);

  const selectedDetail = selectedQuestionId ? detailsByQuestionId[selectedQuestionId] : null;

  useEffect(() => {
    const loadSummary = async () => {
      try {
        setLoadingSummary(true);
        setError(null);
        const response = await submissionService.getMyAssignmentReportSummary(assignmentId);
        if (!response.success) {
          throw new Error(response.message || "Failed to load report summary");
        }
        setSummary(response.data);

        const firstQuestion = response.data?.questions?.[0];
        if (firstQuestion?.assignment_question_id) {
          setSelectedQuestionId(String(firstQuestion.assignment_question_id));
        }
      } catch (err) {
        setError(err.message || "Failed to load report summary");
      } finally {
        setLoadingSummary(false);
      }
    };

    if (assignmentId) {
      loadSummary();
    }
  }, [assignmentId]);

  useEffect(() => {
    const loadDetail = async () => {
      if (!selectedQuestionId) return;
      if (detailsByQuestionId[selectedQuestionId]) return;
      if (!summary?.visibility?.can_view_detailed_report) return;

      try {
        setLoadingDetail(true);
        const response = await submissionService.getMyAssignmentQuestionReport(assignmentId, selectedQuestionId);
        if (!response.success) {
          throw new Error(response.message || "Failed to load question report");
        }
        setDetailsByQuestionId((prev) => ({
          ...prev,
          [selectedQuestionId]: response.data,
        }));
      } catch (err) {
        setError(err.message || "Failed to load question report");
      } finally {
        setLoadingDetail(false);
      }
    };

    loadDetail();
  }, [assignmentId, detailsByQuestionId, selectedQuestionId, summary?.visibility?.can_view_detailed_report]);

  const selectedQuestionSummary = useMemo(() => {
    if (!summary?.questions || !selectedQuestionId) return null;
    return summary.questions.find((q) => String(q.assignment_question_id) === String(selectedQuestionId)) || null;
  }, [summary?.questions, selectedQuestionId]);
  const heatmapData = useMemo(
    () => selectedDetail?.charts?.error_heatmap || [],
    [selectedDetail?.charts?.error_heatmap]
  );
  const testCaseNameMap = useMemo(() => {
    const map = new Map();
    heatmapData.forEach((item, idx) => {
      const key = String(item.test_case_id || `tc_${idx + 1}`);
      map.set(key, item.name || `Test Case ${idx + 1}`);
    });
    return map;
  }, [heatmapData]);

  if (loadingSummary) {
    return (
      <StudentLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      </StudentLayout>
    );
  }

  if (error) {
    return (
      <StudentLayout>
        <div className="max-w-4xl mx-auto py-10">
          <Card>
            <CardContent className="p-6 text-red-600">{error}</CardContent>
          </Card>
        </div>
      </StudentLayout>
    );
  }

  if (!summary) {
    return (
      <StudentLayout>
        <div className="max-w-4xl mx-auto py-10">
          <Card>
            <CardContent className="p-6 text-gray-600">No report data available.</CardContent>
          </Card>
        </div>
      </StudentLayout>
    );
  }

  const reportLocked = !summary?.visibility?.can_view_detailed_report;
  const snapshot = selectedDetail?.submission_snapshot;
  const questionPrompt = selectedDetail?.question?.description || selectedQuestionSummary?.description || "";
  const hasRubricScore = snapshot?.manual_score !== null && snapshot?.manual_score !== undefined;
  const rubricFeedback = typeof snapshot?.feedback_text === "string" ? snapshot.feedback_text.trim() : "";
  const formatResultValue = (value, fallbackText) => {
    if (value === null || value === undefined || value === "") return fallbackText;
    return typeof value === "string" ? value : JSON.stringify(value);
  };

  return (
    <StudentLayout>
      <div className="max-w-7xl mx-auto space-y-6 pb-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/student/assignments">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Assignments
            </Link>
          </Button>
        </div>

        <QuestionReportHeader
          assignment={summary.assignment}
          overallRanking={summary.overall_ranking}
          visibility={summary.visibility}
        />

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-2">
              {summary.questions?.map((q, idx) => {
                const isSelected = String(q.assignment_question_id) === String(selectedQuestionId);

                return (
                  <button
                    key={q.assignment_question_id}
                    onClick={() => setSelectedQuestionId(String(q.assignment_question_id))}
                    className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                      isSelected ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    Q{idx + 1}
                    <span className="mx-1">•</span>
                    {q.my_latest_score}%
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {selectedQuestionSummary ? (
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-semibold text-gray-900">{selectedQuestionSummary.title}</h2>
                <Badge className="bg-gray-100 dark:bg-gray-800 text-gray-700 border-gray-200 dark:border-gray-700">
                  {selectedQuestionSummary.difficulty}
                </Badge>
              </div>
              <div className="text-sm text-gray-600">
                Score: <span className="font-semibold">{selectedQuestionSummary.my_latest_score}%</span>
                <span className="mx-2">|</span>
                Rank: <span className="font-semibold">{selectedQuestionSummary.my_rank ? `#${selectedQuestionSummary.my_rank}` : "—"}</span>
                <span className="mx-2">|</span>
                Percentile: <span className="font-semibold">{selectedQuestionSummary.my_percentile ?? "—"}%</span>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {reportLocked ? (
          <Card>
            <CardContent className="p-6 text-amber-700 bg-amber-50 border border-amber-100 rounded-xl">
              {summary?.visibility?.reason || "Detailed report will be available after grading."}
            </CardContent>
          </Card>
        ) : (
          <>
            {loadingDetail && !selectedDetail ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                  <div className="xl:col-span-8 space-y-6">
                    <Card>
                      <CardContent className="p-5">
                        <h3 className="text-base font-semibold text-gray-900 mb-3">Question Description</h3>
                        {questionPrompt ? (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{questionPrompt}</p>
                        ) : loadingDetail && !selectedDetail ? (
                          <div className="text-sm text-gray-500">Loading description...</div>
                        ) : (
                          <div className="text-sm text-gray-500">No description available for this question.</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-5">
                        <h3 className="text-base font-semibold text-gray-900 mb-3">Submitted Work</h3>
                        {snapshot ? (
                          snapshot.code_content ? (
                            <pre className="bg-[#1e1e1e] text-gray-100 rounded-lg p-4 overflow-auto text-sm">
                              <code>{snapshot.code_content}</code>
                            </pre>
                          ) : (
                            <div className="text-sm text-gray-700 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg p-4">
                              Response: {JSON.stringify(snapshot.response_data)}
                            </div>
                          )
                        ) : (
                          <div className="text-sm text-gray-500">No submission found for this question.</div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-5">
                        <h3 className="text-base font-semibold text-gray-900 mb-1">Your Test Case Outcomes</h3>
                        <p className="text-xs text-gray-500 mb-3">
                          Each card is one autograder test case. We compare your program output with the expected output.
                        </p>
                        {snapshot?.test_results?.length ? (
                          <div className="space-y-3">
                            {snapshot.test_results.map((res, idx) => (
                              <div
                                key={`${res.test_case_id}-${idx}`}
                                className={`border rounded-lg p-3 ${res.status === "pass" ? "border-green-100 bg-green-50/30" : "border-red-100 bg-red-50/30"}`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-sm font-medium text-gray-900">
                                    {testCaseNameMap.get(String(res.canonical_test_case_id || res.test_case_id || `tc_${idx + 1}`)) || `Test Case ${idx + 1}`}
                                  </span>
                                  <Badge className={res.status === "pass" ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}>
                                    {res.status === "pass" ? "Passed" : "Failed"}
                                  </Badge>
                                </div>
                                <div className="text-[11px] text-gray-500 mb-2">
                                  Test Case ID: <span className="font-mono">{res.canonical_test_case_id || res.test_case_id || `tc_${idx + 1}`}</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-1">
                                  <div className="text-xs text-gray-700">
                                    <div className="font-semibold text-gray-500 mb-0.5">Test Input</div>
                                    <code className="block whitespace-pre-wrap bg-white/80 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-800 rounded px-2 py-1">
                                      {formatResultValue(res.input, "(not available)")}
                                    </code>
                                  </div>
                                  <div className="text-xs text-gray-700">
                                    <div className="font-semibold text-gray-500 mb-0.5">Expected Output</div>
                                    <code className="block whitespace-pre-wrap bg-white/80 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-800 rounded px-2 py-1">
                                      {formatResultValue(res.expected_output, "(not available)")}
                                    </code>
                                  </div>
                                  <div className="text-xs text-gray-700">
                                    <div className="font-semibold text-gray-500 mb-0.5">Your Output</div>
                                    <code className="block whitespace-pre-wrap bg-white/80 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-800 rounded px-2 py-1">
                                      {formatResultValue(res.actual_output, "(no output captured)")}
                                    </code>
                                  </div>
                                </div>
                                {res.error_message ? (
                                  <div className="text-xs text-red-600 mt-2">
                                    <span className="font-semibold">Error Details:</span> {res.error_message}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-500">No test results available.</div>
                        )}
                      </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <QuestionBenchmarkScatter points={selectedDetail?.charts?.time_vs_score || []} />
                      <QuestionAttemptTrend data={selectedDetail?.charts?.attempt_trend || []} />
                    </div>
                  </div>

                  <div className="xl:col-span-4 space-y-6">
                    <Card>
                      <CardContent className="p-5 text-sm">
                        <h3 className="text-base font-semibold text-gray-900 mb-3">Benchmark</h3>
                        <div className="space-y-2 text-gray-700">
                          <div>Rank: <span className="font-semibold">{selectedDetail?.benchmark?.rank ? `#${selectedDetail.benchmark.rank}` : "—"}</span></div>
                          <div>Percentile: <span className="font-semibold">{selectedDetail?.benchmark?.percentile ?? "—"}%</span></div>
                          <div>Class Average: <span className="font-semibold">{selectedDetail?.benchmark?.average_score ?? 0}%</span></div>
                          <div>Median: <span className="font-semibold">{selectedDetail?.benchmark?.median_score ?? 0}%</span></div>
                          <div>Participants: <span className="font-semibold">{selectedDetail?.benchmark?.participants ?? 0}</span></div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-5 text-sm">
                        <h3 className="text-base font-semibold text-gray-900 mb-3">Rubric Feedback</h3>
                        {hasRubricScore ? (
                          <div className="text-gray-700 mb-2">
                            Rubric Score: <span className="font-semibold">{snapshot.manual_score}%</span>
                          </div>
                        ) : null}
                        {rubricFeedback ? (
                          <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{snapshot.feedback_text}</p>
                        ) : (
                          <div className="text-gray-500">No rubric feedback shared yet.</div>
                        )}
                      </CardContent>
                    </Card>

                    <QuestionErrorHeatmap
                      data={heatmapData}
                      studentResults={snapshot?.test_results || []}
                    />

                    <AutograderPlusCard
                      submissionSnapshot={snapshot}
                      insights={selectedDetail?.insights}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </StudentLayout>
  );
}
