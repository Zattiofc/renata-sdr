import React, { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FlaskConical, BookOpen, GitBranch, BarChart3, Beaker } from 'lucide-react';
import { SkillLabChat } from '@/components/skilllab/SkillLabChat';
import { SkillLibrary } from '@/components/skilllab/SkillLibrary';
import { SkillVersions } from '@/components/skilllab/SkillVersions';
import { SkillAnalytics } from '@/components/skilllab/SkillAnalytics';

const SkillLab: React.FC = () => {
  return (
    <div className="p-6 max-w-7xl mx-auto h-full overflow-y-auto bg-background text-foreground custom-scrollbar">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
            <FlaskConical className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Skill Lab</h2>
          <span className="px-2 py-0.5 bg-primary/10 border border-primary/20 text-primary text-xs rounded-full font-mono">Beta</span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 ml-12">
          Centro de evolução do SDR — crie, teste, aprove e publique skills com governança completa.
        </p>
      </div>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="chat" className="gap-2">
            <Beaker className="w-4 h-4" />
            Chat Interno
          </TabsTrigger>
          <TabsTrigger value="library" className="gap-2">
            <BookOpen className="w-4 h-4" />
            Biblioteca
          </TabsTrigger>
          <TabsTrigger value="versions" className="gap-2">
            <GitBranch className="w-4 h-4" />
            Versões & Aprovação
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Métricas de Impacto
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat">
          <SkillLabChat />
        </TabsContent>

        <TabsContent value="library">
          <SkillLibrary />
        </TabsContent>

        <TabsContent value="versions">
          <SkillVersions />
        </TabsContent>

        <TabsContent value="analytics">
          <SkillAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SkillLab;
