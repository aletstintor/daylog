import { getTranslations } from 'next-intl/server';
import { getCurrentSession } from '@/app/login/lib/actions';
import { getCommunityShares, getSharedWithMe } from '@/app/(authenticated)/shared/lib/actions';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import PageBody from '@/components/PageBody';
import CommunityFeed from './components/CommunityFeed';
import CommunityTabSwitch from './components/CommunityTabSwitch';

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { user } = await getCurrentSession();
  if (!user) return null;

  const t = await getTranslations('CommunityPage');

  const { tab = 'all' } = await searchParams;
  const activeTab = tab === 'withMe' ? 'withMe' : 'all';

  const [allShares, sharedWithMe] = await Promise.all([
    getCommunityShares(),
    getSharedWithMe(),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title={t('title')}
        description={t('description')}
        breadcrumbs={[{ name: t('breadcrumb'), href: '/community' }]}
      >
        <CommunityTabSwitch activeTabParam={activeTab} />
      </PageHeader>
      <PageBody>
        <CommunityFeed
          allShares={allShares}
          sharedWithMe={sharedWithMe}
          activeTab={activeTab}
        />
      </PageBody>
    </PageContainer>
  );
}
