import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { source } from '@/lib/source';
import { baseOptions, linkItems } from '@/lib/layout.shared';

export default async function Layout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;
  const base = baseOptions(lang);

  return (
    <DocsLayout
      {...base}
      tree={source.pageTree[lang]}
      links={linkItems}
      sidebar={{
        defaultOpenLevel: 0,
      }}
    >
      {children}
    </DocsLayout>
  );
}
