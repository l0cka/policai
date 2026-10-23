import type { Metadata } from 'next';

export const SITE_URL = 'https://a2j.policai.org';
export const SITE_NAME = 'Policai A2J';
export const SITE_TITLE = `${SITE_NAME} - Australian access to justice monitor`;
export const SITE_DESCRIPTION =
  'A monitor of Australian pro bono, access-to-justice and legal assistance news, law reform, funding and deadlines, each item linked to its source.';

/** The generated share card (`app/opengraph-image.tsx`), named explicitly because a page-level openGraph drops the file-convention image. */
export const SITE_SHARE_IMAGE = {
  url: `${SITE_URL}/opengraph-image`,
  width: 1200,
  height: 630,
  alt: `${SITE_NAME}, a monitor of Australian access to justice`,
};

/**
 * Title, description and the matching Open Graph and Twitter fields for one
 * route. Next does not derive og:title or og:description from the page's own
 * title, so a page without this shares as a bare link.
 */
export function pageMetadata(input: {
  title?: string;
  description: string;
  /** Path beginning with `/`. */
  path: string;
}): Metadata {
  const shareTitle = input.title ? `${input.title} - ${SITE_NAME}` : SITE_TITLE;
  const url = input.path === '/' ? SITE_URL : `${SITE_URL}${input.path}`;
  return {
    ...(input.title ? { title: input.title } : {}),
    description: input.description,
    openGraph: {
      type: 'website',
      locale: 'en_AU',
      siteName: SITE_NAME,
      url,
      title: shareTitle,
      description: input.description,
      images: [SITE_SHARE_IMAGE],
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description: input.description,
      images: [SITE_SHARE_IMAGE],
    },
  };
}

/** WebSite + Organization, with the register named as the parent organisation. */
export function siteJsonLd(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: 'en-AU',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        parentOrganization: { '@type': 'Organization', name: 'Policai', url: 'https://policai.org' },
      },
    ],
  }).replace(/</g, '\\u003c');
}
