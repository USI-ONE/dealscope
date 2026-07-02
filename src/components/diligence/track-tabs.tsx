"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArtifactsCard, type ArtifactRow } from "./artifacts-card";
import { BriefingDraftCard } from "./briefing-draft-card";
import { CostLinesCard, type CostLineRow } from "./cost-lines-card";
import { FindingsCard, type FindingRow } from "./findings-card";
import { MaQuestionnaireCard, type MaResponseRow } from "./ma-questionnaire-card";
import { NotesExtractionCard } from "./notes-extraction-card";
import { QuestionnaireCard } from "./questionnaire-card";
import { SessionsCard, type SessionRow } from "./sessions-card";
import type { Question } from "@/lib/diligence/question-library";
import type { Industry } from "@/lib/diligence/industries";
import type { MaQuestion, MaTrack } from "@/lib/diligence/ma-question-library";

type QuestionMeta = { key: string; text: string; category: string; subcategory: string };
type ResponseRow = { questionKey: string; value: unknown; satisfactory: boolean; notes: string | null };

const TRACK_LABELS: Record<MaTrack, string> = {
  legal: "Legal",
  finance: "Finance",
  facilities: "Facilities",
  hr: "HR",
};

export function TrackTabs({
  engagementId,
  canEdit,
  aiAvailable,
  itContent,
  maTracks,
}: {
  engagementId: string;
  canEdit: boolean;
  aiAvailable: boolean;
  itContent: {
    questionnaire: QuestionMeta[];
    questions: Question[];
    responses: ResponseRow[];
    industry: Industry | null;
    sessions: SessionRow[];
    artifacts: ArtifactRow[];
    findings: FindingRow[];
    costLines: CostLineRow[];
    satisfactoryCount: number;
    totalCount: number;
  };
  maTracks: Array<{
    track: MaTrack;
    questions: MaQuestion[];
    responses: MaResponseRow[];
  }>;
}) {
  return (
    <Tabs defaultValue="it">
      <TabsList className="mb-2 flex w-full flex-wrap gap-1 h-auto bg-muted p-1">
        <TabsTrigger value="it" className="flex-1">IT</TabsTrigger>
        {maTracks.map(({ track }) => (
          <TabsTrigger key={track} value={track} className="flex-1">
            {TRACK_LABELS[track]}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* ── IT Track ─────────────────────────────────────────────────────── */}
      <TabsContent value="it" className="space-y-6">
        {aiAvailable && (
          <NotesExtractionCard
            engagementId={engagementId}
            questionMeta={itContent.questionnaire}
            canEdit={canEdit}
          />
        )}

        <QuestionnaireCard
          engagementId={engagementId}
          industry={itContent.industry}
          questions={itContent.questions}
          responses={itContent.responses}
          canEdit={canEdit}
          aiEnabled={aiAvailable}
        />

        <SessionsCard
          engagementId={engagementId}
          sessions={itContent.sessions}
          canEdit={canEdit}
        />

        <ArtifactsCard
          engagementId={engagementId}
          artifacts={itContent.artifacts}
          canEdit={canEdit}
        />

        <FindingsCard
          engagementId={engagementId}
          findings={itContent.findings}
          canEdit={canEdit}
          costLines={itContent.costLines}
        />

        <CostLinesCard
          engagementId={engagementId}
          costLines={itContent.costLines}
          canEdit={canEdit}
          findings={itContent.findings.map((f) => ({ id: f.id, refCode: f.refCode, title: f.title }))}
        />

        {aiAvailable && (
          <BriefingDraftCard
            engagementId={engagementId}
            canEdit={canEdit}
            satisfactoryCount={itContent.satisfactoryCount}
            totalCount={itContent.totalCount}
          />
        )}
      </TabsContent>

      {/* ── Legal / Finance / Facilities / HR Tracks ─────────────────────── */}
      {maTracks.map(({ track, questions, responses }) => (
        <TabsContent key={track} value={track} className="space-y-6">
          <MaQuestionnaireCard
            engagementId={engagementId}
            track={track}
            questions={questions}
            responses={responses}
            canEdit={canEdit}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
