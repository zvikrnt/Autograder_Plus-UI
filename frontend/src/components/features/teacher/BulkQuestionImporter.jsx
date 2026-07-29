import { useState } from "react";
import { Upload, Download, AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Alert, AlertDescription } from "../../ui/alert";
import { assignmentService } from "../../../services/assignmentService";

const BulkQuestionImporter = ({ open, onOpenChange, onSuccess }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [preview, setPreview] = useState(null);

  const formatImportError = (response) => {
    const data = response?.data || response?.errors || {};

    if (Array.isArray(data.errors)) {
      return data.errors.join("\n");
    }

    return (
      data.error ||
      response?.message ||
      "Upload failed"
    );
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".json")) {
      setError("Please select a JSON file");
      setFile(null);
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("File must be smaller than 10MB");
      setFile(null);
      setPreview(null);
      return;
    }

    setFile(selectedFile);
    setError(null);
    setSuccess(null);

    // Preview JSON structure
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        setPreview(data);
      } catch {
        setError("Invalid JSON file");
        setPreview(null);
      }
    };
    reader.readAsText(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await assignmentService.bulkImportQuestions(file);
      if (!response.success) {
        setError(formatImportError(response));
        return;
      }

      setSuccess(response.data);
      setFile(null);
      setPreview(null);

      // Close dialog and refresh after 2 seconds
      setTimeout(() => {
        onOpenChange(false);
        if (onSuccess) onSuccess();
      }, 2000);
    } catch (err) {
      setError(formatImportError(err));
    } finally {
      setUploading(false);
    }
  };

  const downloadTemplate = () => {
    const template = {
      questions: [
        {
          title: "Sum Two Numbers",
          slug: "sum-two-numbers",
          description: "Write a function that returns the sum of two numbers.",
          difficulty: "Easy",
          category: "Basics",
          question_type: "coding",
          entry_point: "add",
          starter_code: "def add(a, b):\n    pass",
          reference_solution: "def add(a, b):\n    return a + b",
          point_value: 100,
          test_cases: [
            {
              input: "2 3",
              expected_output: "5",
              explanation: "Basic addition",
              concept: "Arithmetic",
              is_hidden: false,
              points: 10,
            },
          ],
        },
      ],
    };

    const dataStr = JSON.stringify(template, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "questions_template.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Import Questions</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Instructions */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4 text-sm text-gray-700">
              <p className="mb-2">
                Import multiple questions with test cases from a JSON file.
              </p>
              <Button
                variant="link"
                size="sm"
                onClick={downloadTemplate}
                className="p-0 h-auto text-blue-600 underline"
              >
                <Download className="w-4 h-4 mr-1" />
                Download Template
              </Button>
            </CardContent>
          </Card>

          {/* File Upload */}
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
            <input
              type="file"
              id="json-file-input"
              accept=".json"
              onChange={handleFileChange}
              disabled={uploading}
              className="hidden"
            />
            <label
              htmlFor="json-file-input"
              className="cursor-pointer flex flex-col items-center justify-center"
            >
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-700">
                {file ? file.name : "Click to select or drag JSON file"}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Max size: 10MB
              </p>
            </label>
          </div>

          {/* Preview */}
          {preview && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Preview</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <div className="space-y-2">
                  <p>
                    <strong>Questions:</strong> {preview.questions?.length || 0}
                  </p>
                  {preview.questions?.slice(0, 3).map((q, idx) => (
                    <div key={idx} className="ml-4 text-gray-700">
                      • {q.title} ({q.question_type}) -{" "}
                      {q.test_cases?.length || 0} test cases
                    </div>
                  ))}
                  {preview.questions?.length > 3 && (
                    <p className="ml-4 text-gray-500 text-xs">
                      ... and {preview.questions.length - 3} more
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="whitespace-pre-line">{error}</AlertDescription>
            </Alert>
          )}

          {/* Success Alert */}
          {success && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Success!</strong> {success.details}
                {success.skipped_details && success.skipped_details.length > 0 && (
                  <div className="mt-2 text-sm">
                    <p>Skipped: {success.skipped_details.length}</p>
                    {success.skipped_details.map((item, idx) => (
                      <p key={idx} className="ml-4 text-gray-700">
                        • {item.title}: {item.error}
                      </p>
                    ))}
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BulkQuestionImporter;
