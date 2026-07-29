import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import {
    Search,
    Filter,
    TrendingUp,
    Trophy,
    AlertCircle,
    Eye,
    Loader2,
    ChevronRight
} from "lucide-react";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Switch } from "../../ui/switch";
import { Label } from "../../ui/label";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../ui/table";
import { Card, CardContent } from "../../ui/card";
import { classService } from "../../../services/classService";
import StudentAnalysisDrawer from "./StudentAnalysisDrawer";

export default function MarksTabV2() {
    const { classId } = useParams();
    const [heatmapMode, setHeatmapMode] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    // State for Real Data
    const [gradebook, setGradebook] = useState({ assignments: [], roster: [] });

    useEffect(() => {
        const fetchGrades = async () => {
            if (!classId) return;
            try {
                setLoading(true);
                const response = await classService.getClassGrades(classId);
                setGradebook({
                    assignments: response.data.assignments || [],
                    roster: response.data.roster || []
                });
            } catch (error) {
                console.error("Failed to fetch grades:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchGrades();
    }, [classId]);

    const handleStudentClick = (student) => {
        setSelectedStudent(student);
        setIsDrawerOpen(true);
    };

    if (loading) {
        return <div className="flex justify-center py-10"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>;
    }

    const { assignments, roster } = gradebook;

    // Calculate Class Averages per Assignment
    const assignmentAverages = assignments.map(assign => {
        const scores = roster.map(student => {
            const grade = student.grades[assign.id];
            return grade !== undefined ? grade : null;
        }).filter(score => score !== null);

        if (scores.length === 0) return 0;
        return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    });

    // Calculate Overall Student Averages
    const studentAverages = roster.map(student => {
        const scores = assignments.map(assign => {
            const grade = student.grades[assign.id];
            return grade !== undefined ? grade : null;
        }).filter(score => score !== null);

        if (scores.length === 0) return 0;
        return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    });

    // Class Stats
    const overallClassAverage = studentAverages.length > 0
        ? Math.round(studentAverages.reduce((a, b) => a + b, 0) / studentAverages.length)
        : 0;
    const highestAverage = studentAverages.length > 0 ? Math.max(...studentAverages) : 0;
    const submissionsCount = roster.reduce((acc, student) => acc + Object.keys(student.grades).length, 0);

    const getGradeColor = (score) => {
        if (score === undefined || score === null) return "text-gray-400";
        if (heatmapMode) {
            // Heatmap intensity
            if (score >= 90) return "bg-green-100/80 text-green-900";
            if (score >= 80) return "bg-green-50/80 text-green-800";
            if (score >= 70) return "bg-yellow-50/80 text-yellow-800";
            if (score >= 60) return "bg-orange-50/80 text-orange-800";
            return "bg-red-50/80 text-red-900";
        }
        if (score >= 90) return "text-green-700 font-bold";
        if (score >= 70) return "text-gray-900";
        if (score < 60) return "text-red-600 font-bold";
        return "text-gray-700";
    };

    return (
        <div className="space-y-6">
            {/* Header / Stats - Minimalist Design */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex gap-8">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Class Average</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-3xl font-bold text-gray-900">{overallClassAverage}%</h3>
                            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <TrendingUp className="w-3 h-3" /> +2.4%
                            </span>
                        </div>
                    </div>
                    <div className="w-px bg-gray-200 h-10 self-center"></div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Highest</p>
                        <div className="flex items-baseline gap-2">
                            <h3 className="text-3xl font-bold text-gray-900">{highestAverage}%</h3>
                            <Trophy className="w-4 h-4 text-amber-500" />
                        </div>
                    </div>
                    <div className="w-px bg-gray-200 h-10 self-center"></div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Submissions</p>
                        <h3 className="text-3xl font-bold text-gray-900">{submissionsCount}</h3>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center space-x-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                        <Switch id="heatmap-mode" checked={heatmapMode} onCheckedChange={setHeatmapMode} />
                        <Label htmlFor="heatmap-mode" className="text-sm font-medium text-gray-600 cursor-pointer flex items-center gap-2">
                            <Eye className="w-4 h-4" /> Heatmap
                        </Label>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search students..."
                            className="pl-9 w-64 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
                        />
                    </div>
                </div>
            </div>

            {/* Main Gradebook Table */}
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="overflow-x-auto w-full">
                    <Table className="w-full min-w-max">
                        <TableHeader className="sticky top-0 z-30 bg-gray-50/50">
                            <TableRow className="bg-gray-50/50 hover:bg-gray-50/50 border-b border-gray-200">
                                <TableHead className="w-[200px] max-w-[200px] pl-6 py-4 font-semibold text-gray-600 truncate sticky left-0 bg-gray-50 z-20">Student</TableHead>
                                <TableHead className="w-[80px] text-center font-semibold text-gray-600">Overall</TableHead>
                                {assignments.map(assign => (
                                    <TableHead key={assign.id} className="text-center min-w-[100px] py-4">
                                        <div className="flex flex-col items-center gap-1 group cursor-pointer">
                                            <span className="font-medium text-gray-700 group-hover:text-indigo-600 transition-colors line-clamp-1 max-w-[120px]" title={assign.title}>{assign.title}</span>
                                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">
                                                {assign.points} pts
                                            </span>
                                        </div>
                                    </TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {roster.map((student, idx) => (
                                <TableRow
                                    key={student.id}
                                    className="cursor-pointer hover:bg-indigo-50/30 transition-colors group"
                                    onClick={() => handleStudentClick(student)}
                                >
                                    <TableCell className="pl-6 py-3 font-medium border-r border-transparent group-hover:border-indigo-100 sticky left-0 bg-white z-10">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold border border-gray-200">
                                                {student.name.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="text-sm font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors flex items-center gap-2">
                                                    {student.name}
                                                    <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400" />
                                                </div>
                                                <div className="text-xs text-gray-500">{student.email}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center border-r border-transparent group-hover:border-indigo-100 bg-gray-50/30">
                                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-md font-bold text-sm ${studentAverages[idx] >= 90 ? "text-green-700 bg-green-50" :
                                                studentAverages[idx] < 60 ? "text-red-700 bg-red-50" :
                                                    "text-gray-700 bg-white border border-gray-200"
                                            }`}>
                                            {studentAverages[idx]}%
                                        </span>
                                    </TableCell>

                                    {assignments.map(assign => {
                                        const grade = student.grades[assign.id];
                                        return (
                                            <TableCell key={assign.id} className="p-0 text-center border-r border-transparent group-hover:border-indigo-100/50">
                                                <div className={`h-full w-full py-3 flex flex-col items-center justify-center ${getGradeColor(grade)}`}>
                                                    {grade !== undefined ? (
                                                        <>
                                                            <span className="text-sm font-mono font-medium">
                                                                {((grade / 100) * assign.points).toFixed(1)}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span className="text-gray-300">-</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                        );
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <StudentAnalysisDrawer
                student={selectedStudent}
                classId={classId}
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
            />
        </div>
    );
}
