import whatsNewContent from "@docs/whats-new/v0.2.0.md?raw";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MarkdownRenderer } from "@/components/common/markdown-renderer";

export function WhatsNewPage() {
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-2xl md:text-3xl font-bold">What's New in Dispatcher</h1>
          <Badge variant="outline" className="text-xs">v0.2.0</Badge>
        </div>
        <p className="text-muted-foreground">
          Stay up to date with the latest features and improvements
        </p>
      </div>
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Version 0.2.0</CardTitle>
              <CardDescription>Reliability & Activity Dashboard Update - February 2026</CardDescription>
            </div>
            <Badge>Current</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <MarkdownRenderer content={whatsNewContent} />
        </CardContent>
      </Card>
    </div>
  );
}
