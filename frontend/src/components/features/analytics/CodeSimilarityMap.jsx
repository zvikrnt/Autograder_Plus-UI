import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../ui/card";
import { Info } from "lucide-react";
import { API_CONFIG } from "../../../config/api";


export default function CodeSimilarityMap({ submissions, url }) {
    // Determine the full URL for the media path (url is typically a relative path like /media/...)
    const fullUrl = url ? (url.startsWith('/media/') ? `${API_CONFIG.BASE_URL.replace(/\/api$/, '')}${url}` : url) : null;
    console.log("UMAP Iframe URL:", fullUrl);


    return (
        <Card className="h-full">
            <CardHeader>
                <CardTitle>Approach Clusters (UMAP)</CardTitle>
                <CardDescription>Grouping students by solution strategy & logic.</CardDescription>
            </CardHeader>
            <CardContent className="h-[500px] p-0 overflow-hidden relative">
                {fullUrl ? (
                    <iframe
                        src={fullUrl}
                        className="w-full h-full border-0"
                        title="Code Similarity UMAP"
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center h-full bg-slate-50 text-slate-500 space-y-3">
                        <Info className="w-12 h-12 text-slate-400" />
                        <p className="text-lg font-medium">No Similarity Map Available</p>
                        <p className="text-sm text-center max-w-sm">
                            Run the Autograder+ AI pipeline on this question to generate the interactive clusters map.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
