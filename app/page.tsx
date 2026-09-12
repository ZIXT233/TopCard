import { Suspense } from "react";
import { CardQueueShell } from "@/components/CardQueueShell";
import { I18nProvider } from "@/hooks/useI18n";

export default function Home() {
  return (
    <Suspense>
      <I18nProvider>
        <CardQueueShell />
      </I18nProvider>
    </Suspense>
  );
}
