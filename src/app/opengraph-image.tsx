import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_SHARE_IMAGE } from '@/lib/site-seo';

export const alt = SITE_SHARE_IMAGE.alt;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// ImageResponse cannot read CSS variables. Light values from design/tokens.css:
// --background, --foreground, --primary, --trust.
const PAPER = '#f8f7f3';
const INK = '#202822';
const PRIMARY = '#245847';
const TRUST = '#146b5a';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          display: 'flex',
          background: PAPER,
          color: INK,
        }}
      >
        <div style={{ width: 28, height: size.height, background: PRIMARY }} />
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '72px 80px',
          }}
        >
          <div style={{ fontSize: 92, lineHeight: 1 }}>{SITE_NAME}</div>
          <div
            style={{
              width: 72,
              height: 6,
              background: TRUST,
              marginTop: 28,
              marginBottom: 28,
            }}
          />
          <div style={{ fontSize: 40, color: PRIMARY }}>
            Australian AI policy register
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
