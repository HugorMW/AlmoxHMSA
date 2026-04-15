import React from 'react';

import {
  EmptyState,
  PageHeader,
  ScreenScrollView,
  SectionCard,
} from '@/features/almox/components/common';

export default function OpmeScreen() {
  return (
    <ScreenScrollView>
      <PageHeader
        title="OPME"
        subtitle="Órteses, Próteses e Materiais Especiais."
      />

      <SectionCard>
        <EmptyState
          title="Módulo em construção"
          description="A tela de OPME ainda não possui conteúdo. As funcionalidades serão adicionadas em breve."
        />
      </SectionCard>
    </ScreenScrollView>
  );
}
