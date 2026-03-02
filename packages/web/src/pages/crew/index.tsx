import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Radio, TrendingDown, Activity, Bot } from 'lucide-react';
import { LiveSessionsPanel } from '@/components/crew/LiveSessionsPanel';
import { EpicBurndownPanel } from '@/components/crew/EpicBurndownPanel';
import { CrewActivityTimeline } from '@/components/crew/CrewActivityTimeline';
import { AgentStatusPanel } from '@/components/crew/AgentStatusPanel';

export function CrewPage() {
  const [activeTab, setActiveTab] = useState('sessions');

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Crew Operations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live sessions, burndown, activity feed, and agent leaderboard
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="sessions" className="gap-1.5">
            <Radio className="h-4 w-4" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="burndown" className="gap-1.5">
            <TrendingDown className="h-4 w-4" />
            Burndown
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <Activity className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5">
            <Bot className="h-4 w-4" />
            Agents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions">
          <LiveSessionsPanel />
        </TabsContent>
        <TabsContent value="burndown" className="overflow-hidden min-w-0 w-full">
          <EpicBurndownPanel />
        </TabsContent>
        <TabsContent value="activity">
          <CrewActivityTimeline />
        </TabsContent>
        <TabsContent value="agents">
          <AgentStatusPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
