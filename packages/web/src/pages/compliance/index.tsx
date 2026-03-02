import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CasesPage } from './cases';
import { ScoresPage } from './scores';
import { LawsPage } from './laws';
import { PreflightOverridesPage } from './preflight-overrides';
import { Scale, Trophy, BookOpen, ShieldAlert } from 'lucide-react';

export function CompliancePage() {
  const [activeTab, setActiveTab] = useState('cases');

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Compliance</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cases, agent scores, and law registry
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="cases" className="gap-1.5">
            <Scale className="h-4 w-4" />
            Cases
          </TabsTrigger>
          <TabsTrigger value="scores" className="gap-1.5">
            <Trophy className="h-4 w-4" />
            Scores
          </TabsTrigger>
          <TabsTrigger value="laws" className="gap-1.5">
            <BookOpen className="h-4 w-4" />
            Laws
          </TabsTrigger>
          <TabsTrigger value="preflight-overrides" className="gap-1.5">
            <ShieldAlert className="h-4 w-4" />
            Pre-Flight Overrides
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cases">
          <CasesPage />
        </TabsContent>
        <TabsContent value="scores">
          <ScoresPage />
        </TabsContent>
        <TabsContent value="laws">
          <LawsPage />
        </TabsContent>
        <TabsContent value="preflight-overrides">
          <PreflightOverridesPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
